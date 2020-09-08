
let elements = {};
let isCurrentlyTesting = false;

class BuiltinVoIPTester extends VoIPTester {
    constructor(homeserverUrl, remoteTestServiceUrl, progressContainer) {
        super(homeserverUrl, remoteTestServiceUrl);

        this.progresses = [];
        this.progressContainer = progressContainer;
    }

    onProgress(level, currentValue, maxValue, statusLine) {
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

(function(){

    function radioChangeListener(_e) {
        elements.auth_userpass.style.display =
            elements.authmeth_userpass.checked ? 'block' : 'none';
        elements.auth_accesstoken.style.display =
            elements.authmeth_accesstoken.checked ? 'block' : 'none';
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
            "results"
        ];

        for (let i = 0; i < wantedEles.length; ++i) {
            wantedEle = wantedEles[i];
            console.log(wantedEle);
            elements[wantedEle] = document.getElementById(wantedEle);
        }

        elements.authmeth_userpass.addEventListener('change', radioChangeListener);
        elements.authmeth_accesstoken.addEventListener('change', radioChangeListener);

        elements.testform.addEventListener('submit', (event) => {
            event.preventDefault();

            if (! isCurrentlyTesting) {
                isCurrentlyTesting = true;
                let tester = new BuiltinVoIPTester(elements.homeserver.value, 'v1/test_me', elements.progresslist);

                let loginPromise;

                // unhide progress display
                elements.progress.style.display = 'block';

                if (elements.authmeth_userpass.checked) {
                    loginPromise = tester.loginWithUserIdAndPassword(elements.userid.value, elements.password.value);
                } else if (elements.authmeth_accesstoken.checked) {
                    loginPromise = tester.loginWithAccessToken(elements.accesstoken.value);
                } else {
                    alert("What authentication method are you using?");
                    return;
                }

                loginPromise.then(() => {
                    console.log("Logged in");
                    tester.runTest()
                        .then(report => {
                            console.log(report);
                            isCurrentlyTesting = false;
                        });
                });
            }
        });

        radioChangeListener(null);
    });


})();
