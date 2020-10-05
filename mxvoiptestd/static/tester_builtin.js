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

let elements = {};
let isCurrentlyTesting = false;

class BuiltinVoIPTester extends VoIPTester {
    constructor(homeserverUrl, remoteTestServiceUrl, progressContainer) {
        super(homeserverUrl, remoteTestServiceUrl);

        this.progresses = [];
        this.progressContainer = progressContainer;
    }

    onProgress(level, currentValue, maxValue, statusLine) {
        super.onProgress(level, currentValue, maxValue, statusLine);

        // remove obsolete progress levels if required
        for (let i = level; i < this.progresses.length; ++i) {
            let toRemove = this.progresses.pop().holder;
            toRemove.parentNode.removeChild(toRemove);
        }

        if (level == this.progresses.length + 1) {
            let newHolder = document.createElement('li');
            let newBar = document.createElement('progress');
            let newStatusLine = document.createElement('span');

            newHolder.appendChild(newBar);
            newHolder.appendChild(newStatusLine);

            this.progresses.push({
                holder: newHolder,
                bar: newBar,
                statusLine: newStatusLine
            });

            this.progressContainer.appendChild(newHolder);
        } else if (level > this.progresses.length) {
            console.error("Unhandled progress length difference.");
            return;
        }

        let thisLevel = this.progresses[level - 1];
        thisLevel.bar.value = currentValue;
        thisLevel.bar.max = maxValue;
        thisLevel.statusLine.textContent = statusLine;
    }
}

function newReportNode(parent, title, subtitle, verdict, hasChildren) {
    const reportNode = document.createElement('div');
    parent.appendChild(reportNode);
    reportNode.classList.add('report-node');

    const titleEle = document.createElement('div');
    reportNode.appendChild(titleEle);
    titleEle.classList.add('title');
    titleEle.textContent = title;

    if (subtitle !== null) {
        const subtitleEle = document.createElement('div');
        reportNode.appendChild(subtitleEle);
        subtitleEle.classList.add('subtitle');
        subtitleEle.textContent = subtitle;
    }

    if (verdict !== null) {
        const verdictEle = document.createElement('div');
        reportNode.appendChild(verdictEle);
        verdictEle.classList.add('verdict');
        verdictEle.classList.add(verdict.toLowerCase());
        verdictEle.textContent = verdict;
    }

    if (hasChildren) {
        const childContainer = document.createElement('div');
        parent.appendChild(childContainer);

        childContainer.classList.add('report-subtree');

        childContainer.hidden = true;

        reportNode.classList.add('expandable');
        reportNode.addEventListener('click', () => {
            childContainer.hidden = !childContainer.hidden;
            if (childContainer.hidden) {
                reportNode.classList.remove('expanded');
            } else {
                reportNode.classList.add('expanded');
            }
        });
        return childContainer;
    }
}

function escapeHtml(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

function newInfoNode(parent, text) {
    const infoNode = document.createElement('div');
    parent.appendChild(infoNode);
    infoNode.classList.add('report-info-node');
    infoNode.textContent = text;
    return infoNode;
}

function displayVersionedReport(report, version, rootNode) {
    const turnUrisSorted = Object.keys(report);
    turnUrisSorted.sort();

    let stunSupported = false;
    let turnSupported = false;

    let flags = {
        'tcp-turn': false,
        'tcp-turns': false,
        'tcp-turns-443': false,
        'udp-turn': false,
        'udp-turns': false,
    };

    for (let server of turnUrisSorted) {
        let reportForServer = report[server];

        if (reportForServer.report.stun) {
            stunSupported = true;
        }
        if (reportForServer.report.turn) {
            turnSupported = true;
        }

        for (let flag of reportForServer.report.flags) {
            flags[flag] = true;
        }
    }

    const combo = (stunSupported ? 'S' : '') + (turnSupported ? 'T' : '');

    let verSummary;
    let verVerdict;
    let extraInfo = null;

    switch (combo) {
    case 'S':
        verSummary = 'STUN only (No TURN)';
        verVerdict = 'Poor';
        extraInfo = 'STUN will help users with some kinds of NATs. ' +
            'However, some NATs will need TURN support for connections to succeed.';
        break;
    case 'T':
        verSummary = 'TURN only (No STUN)';
        verVerdict = 'Poor';
        extraInfo = 'TURN will help users on all kinds of NATs. ' +
            'From this perspective, your configuration is good. ' +
            'However, TURN involves relaying all the users\' traffic, which can be costly or overload your server if there are many connections. ' +
            'For some users, STUN would suffice and would allow these users to establish direct connections, so your server would not need to ' +
            'relay all their traffic. For this reason, working STUN configuration is recommended.';
            // TODO offer context-sensitive help of TURN/UDP candidate if one doesn't exist.
        break;
    case 'ST':
        verSummary = 'STUN & TURN';

        // Scoring strategy for STUN+TURN compatible:
        // - Good: TURN/udp (STUN over TLS not commonly implemented so always want this)
        // - Great: TURNS/tcp plus Good
        // - Excellent: TURNS/tcp on port 443 plus Good

        if (flags['tcp-turns-443'] && flags['udp-turn']) {
            // This has the best chance of success AND encrypts the credentials.
            verVerdict = 'Excellent';
            extraInfo = 'With STUN support and TURN, most users will succeed in establishing a connection. ' +
                'On top of that, thanks to support of Encrypted TURN over port 443, you have the highest chance of ' +
                'being able to evade firewall rules in locked-down environments.';
        } else if (flags['udp-turn'] && (flags['tcp-turns'] || flags['udp-turns'])) {
            // TODO think: TURNS/udp is barely a thing, apparently
            // Require an encrypted method for TURN credentials for Great
            verVerdict = 'Great';
            extraInfo = 'With STUN support and TURN, most users will succeed in establishing a connection. ' +
                'However, some firewalls are configured to block most outbound ports. If you have a Secure TURN service on TCP port 443, ' +
                'you would have the highest chance of being able to evade firewall rules in locked-down environments. ' +
                'This score is often "good enough" for small homeservers used by individuals who do not have corporate-style locked-down ' +
                'firewalls.';
        } else if (flags['udp-turn']) {
            // STUN is only available over unencrypted UDP in many browsers
            verSummary = 'STUN & TURN (unencrypted credentials!)';
            verVerdict = 'Good';
            extraInfo = 'With STUN support and TURN, most users will succeed in establishing a connection. ' +
                'However, your TURN service is not encrypted, which means that TURN credentials will be sent in cleartext. ' +
                'Beyond this, some firewalls are configured to block most outbound ports. If you have a Secure TURN service on TCP port 443, ' +
                'you would have the highest chance of being able to evade firewall rules in locked-down environments. ';
        } else {
            verVerdict = 'Poor';
            verSummary = 'STUN & TURN (with caveats)';
            extraInfo = 'This score means that you do not have a TURN service over unencrypted UDP. ' +
                'Many web browsers are not able to perform STUN except over unencrypted UDP. ' +
                'For best results, add a STUN (or TURN) service over unencrypted UDP so that these implementations can do STUN.';
        }
        break;
    case '':
        verSummary = 'No support';
        verVerdict = 'Fail';
        if (version === 'IPv6') {
            extraInfo = 'No STUN or TURN support found. Do both your browser and network have IPv6 support? ' +
                'If not, you are unable to test it. Please note that some browsers will not try IPv6 if IPv4 is ' +
                'available, which will mean this test is invalid.';
        } else {
            extraInfo = 'No STUN or TURN support found. (Do you have IPv4 support?)';
        }
        break;
    default:
        verSummary = '???';
        verVerdict = '???';
    }

    const verNode = newReportNode(rootNode, 'Test servers (' + version + ')', verSummary, verVerdict, true);

    newInfoNode(verNode, extraInfo);


    for (let server of turnUrisSorted) {
        let reportForServer = report[server];

        const scombo = (reportForServer.report.stun ? 'S' : '') + (reportForServer.report.turn ? 'T' : '');

        let serverSummary;
        let serverVerdict;

        switch (scombo) {
            case 'S':
                serverSummary = 'STUN only';
                serverVerdict = 'Poor';
                break;
            case 'T':
                if (! reportForServer.report.flags['udp-turn']) {
                    // not expecting STUN unless it's cleartext UDP
                    serverSummary = 'TURN';
                    serverVerdict = 'Excellent';
                } else {
                    serverSummary = 'TURN only';
                    serverVerdict = 'Poor';
                }
                break;
            case 'ST':
                serverSummary = 'STUN & TURN';
                serverVerdict = 'Excellent';
                break;
            case '':
                serverSummary = "Didn't work";
                serverVerdict = 'Fail';
                break;
            default:
                serverSummary = '???';
                serverVerdict = '???';
        }

        const serverNode = newReportNode(verNode, server, serverSummary, serverVerdict, true);

        const infoNode = newInfoNode(serverNode, '');

        let para = document.createElement('p');
        infoNode.appendChild(para);

        if (reportForServer.turnRelayResult.success) {
            para.textContent = 'Succeeded the relaying test.';
        } else {
            para.textContent = 'Failed the relaying test: ' + reportForServer.turnRelayResult.error;
        }

        // again, not a fan of this approach of building DOM trees but no time
        // to research anything better, really.

        let candidateListHeading = document.createElement('strong');
        infoNode.appendChild(candidateListHeading);
        candidateListHeading.textContent = 'Candidates:';

        let candidateList = document.createElement('ul');
        infoNode.appendChild(candidateList);

        for (let candidate of reportForServer.candidates.details) {
            let candidateEle = document.createElement('li');
            candidateList.appendChild(candidateEle);

            let typeString = candidate.type;
            if (candidate.type == 'srflx') {
                typeString = 'server-reflexive (STUN)';
            } else if (candidate.type == 'relay') {
                typeString = 'relay (TURN)';
            }

            candidateEle.textContent = candidate.ip + ' port ' + candidate.port + '/' + candidate.proto + ' (' + typeString + ')';
        }
    }


}

function displayReport(report, rootNode) {
    // clear it! Could be confusing to have multiple resultsets on the page.
    rootNode.innerHTML = '';

    const numTurnServers = report.turnConfig.uris.length;

    const csApiNode = newReportNode(rootNode, 'Asked homeserver for TURN servers', numTurnServers + ' URIs received.', numTurnServers > 0 ? 'Excellent' : 'Fail', true);

    if (numTurnServers > 0) {
        const turnServerList = newInfoNode(csApiNode, 'GET /_matrix/client/r0/voip/turnServer yielded the following information:');

        // TODO not a fan of the lists
        let list = document.createElement('ul');
        turnServerList.appendChild(list);

        let listEle = document.createElement('li');
        listEle.textContent = 'Username: ' + report.turnConfig.username;
        list.appendChild(listEle);

        listEle = document.createElement('li');
        listEle.textContent = 'Password: ' + report.turnConfig.password;
        list.appendChild(listEle);

        listEle = document.createElement('li');
        listEle.textContent = 'Server URIs:';
        list.appendChild(listEle);

        let uriList = document.createElement('ul');
        listEle.appendChild(uriList);

        for (let turnServerUri of report.turnConfig.uris) {
            listEle = document.createElement('li');
            listEle.textContent = turnServerUri;
            uriList.appendChild(listEle);
        }
    } else {
        newInfoNode(csApiNode, 'GET /_matrix/client/r0/voip/turnServer did not yield any TURN servers. Check your homeserver configuration.');
    }

    displayVersionedReport(report.passes['IPv4'], 'IPv4', rootNode);
    displayVersionedReport(report.passes['IPv6'], 'IPv6', rootNode);
}

async function performTest() {
    const tester = new BuiltinVoIPTester(elements.homeserver.value, 'v1/test_me', elements.progresslist);

    // unhide progress display
    elements.progress.hidden = false;

    if (elements.authmeth_userpass.checked) {
        await tester.loginWithUserIdAndPassword(elements.userid.value, elements.password.value);
    } else if (elements.authmeth_accesstoken.checked) {
        await tester.loginWithAccessToken(elements.accesstoken.value);
    } else {
        alert("What authentication method are you using?");
        return;
    }

    console.log("Logged in — running test now.");
    return await tester.runTest();
}

(function(){

    function radioChangeListener(_e) {
        elements.auth_userpass.hidden = ! elements.authmeth_userpass.checked;
        elements.auth_accesstoken.hidden = ! elements.authmeth_accesstoken.checked;
    }

    window.addEventListener('DOMContentLoaded', (event) => {
        console.log('DOM fully loaded and parsed', VoIPTester);

        wantedEles = [
            "authmeth_userpass",
            "auth_userpass",
            "authmeth_accesstoken",
            "auth_accesstoken",
            "homeserver",
            "userid",
            "password",
            "accesstoken",
            "testform",
            "progresslist",
            "progress",
            "results",
            "result_container"
        ];

        for (let i = 0; i < wantedEles.length; ++i) {
            wantedEle = wantedEles[i];
            elements[wantedEle] = document.getElementById(wantedEle);
        }

        elements.authmeth_userpass.addEventListener('change', radioChangeListener);
        elements.authmeth_accesstoken.addEventListener('change', radioChangeListener);

        elements.testform.addEventListener('submit', (event) => {
            event.preventDefault();

            if (! isCurrentlyTesting) {
                isCurrentlyTesting = true;
                elements.testform.hidden = true;
                performTest()
                    .then(report => {
                        console.log("Test report", report);

                        elements.results.hidden = false;
                        displayReport(report, elements.result_container);
                    })
                    .catch(exc => {
                        // TODO handle this better
                        alert("Error occurred during test: " + exc);
                        console.error("Test erred", exc);
                    })
                    .finally(() => {
                        isCurrentlyTesting = false;
                        elements.progress.hidden = true;
                        elements.testform.hidden = false;
                    });
            }
        });

        radioChangeListener(null);
    });


})();
