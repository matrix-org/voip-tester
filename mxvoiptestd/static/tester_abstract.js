/*
 * Copyright 2019-2020 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class VoIPTesterError extends Error {
    constructor(errcode, message, cause) {
        super(message);
        this.errcode = errcode;
        this.cause = cause;

        // https://stackoverflow.com/a/500531
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }

    toString() {
        return super.toString() + " [" + this.errcode + "]";
    }
}

let VoIPTesterErrors = {
    BAD_ACCESS_TOKEN: "Bad access token",
    FAILED_HOMESERVER_CONNECTION: "Failed homeserver connection",
    BAD_LOGIN_CREDENTIALS: "Bad credentials",
    LOGIN_FAILURE: "Login method not supported. Supply an access token manually instead.",
    BAD_TURN_CREDENTIALS: "Bad TURN credentials",
    CANNOT_GET_TURN_CREDENTIALS: "Can't get TURN credentials from homeserver",
    NO_TURN_SERVERS: "No TURN servers",
    UNKNOWN: "Unknown",

    INTERACTIVE_TEST_FAIL: "Interactive test failed",
    NO_RELAY_CANDIDATES: "No relay candidates available to perform relay test",

    FAILED_SERVICE_REQUEST: "Failed testing service request",
    FAILED_DOCTOR_SDP: "Failed to doctor the SDP",
};

const MAGIC_QUESTION = "Hello? Is this on?";
const MAGIC_ANSWER = "Yes; yes, it is! :^)";
const MAGIC_QA_TIMEOUT = 150000;  // 150 seconds

function getIpVersion(ipAddress) {
    if (/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(ipAddress)) {
        return 'IPv4';
    } else if (ipAddress.indexOf(':') !== -1) {
        return 'IPv6';
    } else {
        return 'mDNS or other';
    }
}

function parseTurnUri(uri) {
    // yucky roll-your-own in the interest of time
    let [uriPart, argsStr] = uri.split('?');
    let [protocol, host, port] = uriPart.split(':');

    let params = {transport: 'udp'};

    let argPairStrs = argsStr.split('&');
    for (let argPairStr of argPairStrs) {
        let [key, value] = argPairStr.split('=');
        params[key] = value;
    }

    return {
        protocol: protocol,
        host: host,
        port: port,
        params: params
    };
}

class VoIPTester {
    constructor(homeserverUrl, remoteTestServiceUrl) {
        this.homeserver = homeserverUrl;
        this.remoteTestServiceUrl = remoteTestServiceUrl;
        this.accessToken = null;
    }

    _fetchClient(path, method, body) {
        let extra = {
            headers: {
                'Authorization': 'Bearer ' + this.accessToken,
            },
            method: method,
        };

        if (method == 'PUT' || method == 'POST') {
            extra.headers['Content-Type'] = 'application/json';
            extra.body = JSON.stringify(body);
        }

        return fetch(this.homeserver + "/_matrix/client/r0" + path, extra);
    }

    async loginWithUserIdAndPassword(userId, password) {
        const resp = await this._fetchClient("/login", "POST", {
            type: "m.login.password",
            identifier: {
                type: "m.id.user",
                user: userId,
            },
            password: password,
            initial_device_display_name: "VoIP Tester",
        });
        
        const resp_obj = await resp.json();
        
        if (resp.status == 200) {
            this.accessToken = resp_obj.access_token;
        } else if (resp.status == 403) {
            throw new VoIPTesterError(
                VoIPTesterErrors.BAD_CREDENTIALS,
                resp_obj.error || "403 on /login"
            );
        } else if (resp.status == 400) {
            throw new VoIPTesterError(
                VoIPTesterErrors.LOGIN_FAILURE,
                resp_obj.error || "400 on /login"
            );
        } else {
            const errStr = resp_obj.errcode + " " + resp_obj.error + " " + resp_obj.status;
            throw new VoIPTesterError(
                VoIPTesterErrors.UNKNOWN,
                errStr
            );
        }
    }

    async loginWithAccessToken(accessToken) {
        this.accessToken = accessToken;
        try {
            const response = await this._fetchClient("/account/whoami", "GET");
            console.log("then", response);
        } catch (error) {
            throw new VoIPTesterError(
                VoIPTesterErrors.FAILED_HOMESERVER_CONNECTION,
                "Failed to connect for /account/whoami",
                error
            );
        }
    }

    async gatherTurnConfig() {
        const resp = await this._fetchClient("/voip/turnServer", "GET");
        const resp_obj = await resp.json();
        
        if (resp.status != 200) {
            const errStr = resp_obj.errcode + " " + resp_obj.error + " " + resp_obj.status;

            throw new VoIPTesterError(
                VoIPTesterErrors.CANNOT_GET_TURN_CREDENTIALS,
                errStr
            );
        }
        if (resp_obj.uris.length < 1) {
            throw new VoIPTesterError(
                VoIPTesterErrors.NO_TURN_SERVERS,
                "Empty `uris` list from /voip/turnServer"
            );
        }
        return resp_obj;
    }

    gatherCandidatesForIceServer(turnUri, turnUsername, turnPassword, turnOnly) {
        const candidates = [];

        const conn = new RTCPeerConnection({
            iceServers: [
                {
                    urls: turnUri,
                    username: turnUsername,
                    credential: turnPassword
                }
            ],
            // using 'relay' mode is an experiment, seems to prevent a lot of
            // the hassle of the client generating peer-reflexive candidates by
            // contacting the server directly...
            iceTransportPolicy: turnOnly ? 'relay' : 'all'
        });

        const dataChannel = conn.createDataChannel("voiptest");

        return new Promise(resolve => {
            conn.onicecandidate = function (evt) {
                console.log("ICE Candidate", evt);

                if (evt.candidate === null) {
                    // this is the end-of-candidates marker
                    console.log("End of candidates");
                    console.log("Local description:", conn.localDescription);
                    resolve({
                        peerConnection: conn,
                        dataChannel: dataChannel,
                        candidates: candidates,
                    });
                } else {
                    candidates.push(evt.candidate);
                }

                evt.preventDefault(); // TODO what was this doing? is it needed? suspect it was for an experiment last year.
            };

            conn.onicegatheringstatechange = function (evt) {
                const newState = conn.iceGatheringState;
                console.log("ICE now in state:", newState);
            };

            console.log("Waiting for negotiationneeded");
            conn.addEventListener("negotiationneeded", ev => {
                console.log("negotionneeded fired; Creating offer");
                conn.createOffer().then(offer => {
                    console.log("Offer created:", offer);
                    conn.setLocalDescription(offer)
                });
            });
        });
    }

    /**
     * Doctors (modifies) some SDP to remove candidates that wouldn't
     * exercise the candidate we want to test.
     *
     * Beware that this probably won't behave for more than one media track.
     */
    doctorOfferSdp(offerSdp, soleWantedCandidate) {
        console.log("in");
        console.log(offerSdp);
        const sdpLines = offerSdp.split(/\r?\n/g);

        let foundPreservedCandidate = false;
        let foundEndOfCandidates = false;

        // .candidate gives the candidate SDP for it, but this varies from the SDP!
        // .foundation is a unique identifier, and not necessarily ordinal
        const checkingFor = "a=candidate:" + soleWantedCandidate.foundation + " ";

        for (let i = sdpLines.length - 1; i >= 0; --i) {
            if (sdpLines[i].startsWith(checkingFor)) {
                // this is a candidate line, and it's the one we want
                foundPreservedCandidate = true;
                if (! foundEndOfCandidates) {
                    sdpLines.splice(i + 1, 0, "a=end-of-candidates");
                }
            } else if (sdpLines[i].startsWith("a=candidate:")) {
                // remove index i – not a wanted candidate
                sdpLines.splice(i, 1);
            }
            if (sdpLines[i].startsWith("a=end-of-candidates")) {
                foundEndOfCandidates = true;
            }
        }

        if (! foundPreservedCandidate) {
            throw new VoIPTesterError(
                VoIPTesterErrors.FAILED_DOCTOR_SDP,
                "Failed to find wanted candidate in offer SDP."
            );
        }

        console.log("out");
        console.log(sdpLines.join("\r\n"));
        return sdpLines.join("\r\n");
    }

    async testTurnRelaying(ipVersion, candidateResult) {
        // select a relay candidate of the appropriate IP version

        let candidate = null;
        for (let i = 0; i < candidateResult.candidates.length; ++i) {
            let potentialCandidate = candidateResult.candidates[i];
            if (potentialCandidate.type == 'relay' &&
                getIpVersion(potentialCandidate.ip || potentialCandidate.address) == ipVersion) {
                candidate = potentialCandidate;
                break;
            }
        }

        if (candidate === null) {
            throw new VoIPTesterError(VoIPTesterErrors.NO_RELAY_CANDIDATES);
        }

        let connection = candidateResult.peerConnection;
        let dataChannel = candidateResult.dataChannel;

        let doctoredSdp = this.doctorOfferSdp(connection.localDescription.sdp, candidate);

        // we can't set the doctored SDP on ourselves — the browser won't allow
        // it.
        //await connection.setLocalDescription(connection.localDescription);

        const resp = await fetch(this.remoteTestServiceUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                offer: {
                    sdp: doctoredSdp,
                    type: connection.localDescription.type
                }
            })
        });

        if (resp.status != 200) {
            throw new VoIPTesterError(
                VoIPTesterErrors.FAILED_SERVICE_REQUEST,
                resp.status + " when contacting testing service"
            );
        }

        let intentionalClose = false;

        const finishedPromise = new Promise((resolve, reject) => {
            const timer = window.setTimeout(function() {
                intentionalClose = true;
                dataChannel.close();
                connection.close();
                reject(new VoIPTesterError(
                    VoIPTesterErrors.INTERACTIVE_TEST_FAIL,
                    "Echo test timed out."
                ));
            }, MAGIC_QA_TIMEOUT);

            dataChannel.onmessage = function (event) {
                console.log("received: " + event.data);
                if (event.data == MAGIC_ANSWER) {
                    console.log("senders", connection.getSenders());
                    console.log("receivers", connection.getReceivers());
                    console.log("got the magic answer!");
                    // stop the timeout timer
                    window.clearTimeout(timer);
                    intentionalClose = true;
                    dataChannel.close();
                    connection.close();
                    resolve();
                }
            };

            dataChannel.onopen = function () {
                console.log("datachannel open, sending magic question");
                dataChannel.send(MAGIC_QUESTION);
            };

            dataChannel.onclose = function () {
                console.log("datachannel close");
                if (! intentionalClose) {
                    reject(new VoIPTesterError(
                        VoIPTesterErrors.INTERACTIVE_TEST_FAIL,
                        "Data channel closed unexpectedly."
                    ));
                }
            };

            dataChannel.onerror = function (event) {
                console.error("datachannel error", event.message, event.filename, event.lineno, event.colno);
                reject(new VoIPTesterError(
                    VoIPTesterErrors.INTERACTIVE_TEST_FAIL,
                    "Data channel error: " + event.message
                ));
                intentionalClose = true;
            }
        });


        const serviceResponse = await resp.json();
        console.log("ANSWER", serviceResponse.answer);
        connection.setRemoteDescription(serviceResponse.answer); // TODO await??

        // wait for things to happen, or time out with failure
        try {
            await finishedPromise;
        } catch (error) {
            console.error("during TURN test", error);
            return {
                success: false,
                error: error
            };
        }

        return {
            success: true,
            // TODO can we store the active candidate here? Even if we must ask
            // the server for it...
        };
    }

    /**
     * Runs the test against either IPv4 or IPv6 (specify 'IPv4' or 'IPv6').
     *
     * Note that the IP version refers to that of the candidates – not that
     * of the STUN/TURN protocol itself (as we cannot control that really).
     */
    async runIpVersionedTest(ipVersion, testReport, turnConfig) {
        let numUris = turnConfig.uris.length;
        let numTested = 0;
        let candidateResults = [];

        let testPassReport = testReport.passes[ipVersion];

        for (let i = 0; i < numUris; ++i) {
            const turnUri = turnConfig.uris[i];
            testPassReport[turnUri] = {};

            this.onProgress(2, i, numUris, "TURN URI: " + turnUri);

            this.onProgress(3, 0, 3, "Gathering candidates");

            const candidateResult = await this.gatherCandidatesForIceServer(turnUri, turnConfig.username, turnConfig.password, false);
            testPassReport[turnUri].candidates = this.summariseCandidateGathering(candidateResult, ipVersion);

            this.onProgress(3, 1, 3, "Gathering relay candidates for a TURN test");

            // annoyingly, setting the ICE policy to relay seems to make a useful change
            // for making the TURN test actually consistent.
            // Unfortunately, it doesn't exercise STUN functionality by doing that, so
            const turnCandidateResult = await this.gatherCandidatesForIceServer(turnUri, turnConfig.username, turnConfig.password, true);

            this.onProgress(3, 2, 3, "Testing TURN relaying");

            let turnRelayResult;

            try {
                turnRelayResult = await this.testTurnRelaying(ipVersion, turnCandidateResult);
            } catch (error) {
                console.error("during testTurnRelaying", error);
                turnRelayResult = {
                    success: false,
                    error: error
                };
            }

            testPassReport[turnUri].turnRelayResult = turnRelayResult;

            testPassReport[turnUri].report = this.summariseTurnUriReport(ipVersion, turnUri, testPassReport[turnUri]);

            this.onProgress(3, 3, 3, "TURN relay test attempted");
        }

        this.onProgress(2, numUris, numUris, "All TURN URIs attempted");

        return testPassReport;
    }

    async runTest() {
        this.onProgress(1, 0, 3, "Requesting TURN details from homeserver");

        let testReport = {
            passes: {
                'IPv4': {},
                'IPv6': {}
            }
        };

        window.testReport = testReport;

        const turnConfig = await this.gatherTurnConfig();

        this.onProgress(1, 1, 3, "Testing (IPv4 candidates)");

        testReport.turnConfig = turnConfig;

        const ipv4 = await this.runIpVersionedTest('IPv4', testReport, testReport.turnConfig);
        testReport.passes.IPv4 = ipv4;
        this.onProgress(1, 2, 3, "Testing (IPv6 candidates)");

        const ipv6 = await this.runIpVersionedTest('IPv6', testReport, testReport.turnConfig);
        testReport.passes.IPv6 = ipv6;

        this.onProgress(1, 3, 3, "Test complete");

        // TODO finalise and process report

        return testReport;
    }


    summariseCandidateGathering(candidateResult, ipVersion) {
        let candidates = [];

        let seenType = {
            srflx: false,
            relay: false
        };

        for (let candidate of candidateResult.candidates) {
            if (getIpVersion(candidate.ip || candidate.address) !== ipVersion) {
                continue;
            }
            if (candidate.type == 'srflx' || candidate.type == 'relay') {
                seenType[candidate.type] = true;
                candidates.push({
                    proto: candidate.protocol,
                    type: candidate.type,
                    ip: candidate.ip || candidate.address,
                    port: candidate.port
                });
            }
        }

        return {
            details: candidates,
            stun: seenType.srflx,
            turn: seenType.relay,
        };
    }

    summariseTurnUriReport(ipVersion, uri, turnUriReport) {
        let flags = [];
        const parsedUri = parseTurnUri(uri);

        const transport = parsedUri.params.transport || 'udp';
        if (transport == 'udp') {
            switch (parsedUri.protocol) {
            case 'turn':
                flags.push('udp-turn');
                break;
            case 'turns':
                flags.push('udp-turns');
                break;
            default:
                console.warn("unknown protocol", parsedUri.protocol);
            }
        } else if (transport == 'tcp') {
            switch (parsedUri.protocol) {
                case 'turn':
                    flags.push('tcp-turn');
                    break;
                case 'turns':
                    flags.push('tcp-turns');
                    if (parsedUri.port === '443') {
                        flags.push('tcp-turns-443');
                    }
                    break;
                default:
                    console.warn("unknown protocol", parsedUri.protocol);
            }
        } else {
            console.warn("unknown transport", parsedUri.params.transport);
        }

        let result = {
            flags: flags,
            stun: turnUriReport.candidates.stun, // TODO test stun gives the correct answer...
            turn: turnUriReport.candidates.turn && turnUriReport.turnRelayResult.success,
        };

        if (turnUriReport.turnRelayResult.error !== undefined) {
            result.relayingError = turnUriReport.turnRelayResult.error;
        }

        // TODO do we want to report the time taken for anything?

        return result;
    }


    // The following methods are intended to be overridden

    /**
     * Called when we have information about progress.
     * Progress levels can be thought of as a tree / hierarchy.
     * Progress at level `i` must be completed to make progress in level `i - 1`.
     * level will never be more than 1 greater than the previously-called level.
     *
     * Args:
     * - level (int): The depth of the hierarchy; starting at 1 for the root task.
     * - currentValue (int): Amount of completed progress at this level.
     * - maxValue (int): Maximum amount of doable progress at this level.
     * - statusLine (String): Terse human-readable summary of progress at this level.
     */
    onProgress(level, currentValue, maxValue, statusLine) {
        let prefix = "• ".repeat(level);
        console.log(prefix + "[" + currentValue + "/" + maxValue + "] " + statusLine);
    }
}
