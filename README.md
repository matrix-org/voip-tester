This is a work-in-progress VoIP test utility for Matrix.

There is the opportunity to build on it programatically, but the project also
includes a web frontend that runs in-browser.

It tests your homeserver's STUN/TURN servers and generates a report and score.


## mxvoiptestd (test daemon)

### How it's used

The user accesses the test utility page in their web browser. (Their web browser
must support WebRTC.)

The user logs in to an account on their homeserver and their web browser requests
the homeserver's ICE (STUN/TURN) server details.

The browser contacts the TURN servers and gathers ICE candidates. Once this is
done, the browser offers the candidates to the `mxvoiptestd` server and waits for
an answer.

`mxvoiptestd` begins gathering its own candidates and answers.

The browser and the server connect to each other and exchange a greeting over an
`RTCDataChannel`.

This process is repeated for every TURN URI and in both IPv4 and IPv6 to build up
a report.


#### Current scoring system

**Overall scores for IPv4 and IPv6 support**:

* Fail: No STUN or TURN support whatsoever.
* Poor: Either only STUN or only TURN.
* Good: STUN supported and TURN supported over at least one protocol.
* Great: STUN supported and TURN supported over at least one **secure** protocol.
* Excellent: In addition to 'Great', there is a secure TURN service over TCP port
  443 (which looks like HTTPS traffic and will likely get through more firewalls).

Note: Only STUN on an unencrypted UDP port will be considered.

**Scores for individual TURN URIs:**

* Fail: Neither STUN candidates nor (working) TURN candidates found.
* Poor: Only STUN candidates found, or only TURN candidates when we expected STUN too.
* Excellent: TURN candidates found and tested to work. STUN candidates found if applicable.

Note: Only STUN on an unencrypted UDP port will be considered.

### Warning

This utility is not yet finished and will inevitably have bugs;
please see the list of issues for points of needed development and investigation.


### Thoughts on further directions

The browser WebRTC API is quite restrictive; e.g. it does not allow changing the
candidates in use (even by attempting to alter the SDP).

We also can't access any of the information needed to deeply diagnose STUN and
TURN errors.

Ultimately, I would loved to have taken this further but I think that needs to
go out of the browser.

(With the user's consent, the TURN credentials could be shared with the server
to do this testing and have the results show up in the report.)


### Notes on deployment

Install into a venv and run with `hypercorn`:

`VOIPTEST_CONFIG=/path/to/config.toml hypercorn mxvoiptestd.webapi:app --log-level info --error-logfile -`

Note that a configuration file is optional — but you will need one if you need
to use a TURN server for your `mxvoiptestd` (such as if `mxvoiptestd` is behind NAT).


## Development instructions

### Set up

You may need some dependencies which can be installed on Debian and Ubuntu with:

`sudo apt install libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config`

These dependencies may be required for `aiortc`, which has instructions for other
operating systems [here](https://github.com/aiortc/aiortc#installing).

(In some cases, binary releases are available for `aiortc` so you may not need
to install these manually.)

Create a venv for this project and `pip install -e /path/to/mxvoiptestd` whilst
having the venv activated.


### Compiling SCSS

```
scss scss/tester.scss -t compressed > mxvoiptestd/static/tester.css
```

Currently, to avoid hassle, the resultant `tester.css` should be committed in
this repository whenever `tester.scss` is updated.
