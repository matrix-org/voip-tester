# -*- coding: utf-8 -*-
# Copyright 2019-2020 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from aiortc.sdp import SessionDescription


def doctor_sdp(original_sdp, sole_wanted_candidate):
    # filter out irrelevant candidates from the SDP directly
    session_description = SessionDescription.parse(original_sdp)

    for media in session_description.media:
        print("media", media)
        # note that this could cause problems with multiple media
        # as I guess you should only use each candidate once…
        media.ice_candidates = [sole_wanted_candidate]
        media.ice_candidates_complete = True

        # remove a=ice-options: to prevent Trickle ICE, as we need to
        # generate all the candidates at once as we only get one chance to
        # answer over a REST call.
        media.ice_options = None

    return str(session_description)


def remove_all_candidates(original_sdp):
    # filter out all candidates from the SDP directly
    session_description = SessionDescription.parse(original_sdp)

    for media in session_description.media:
        print("media", media)
        media.ice_candidates = []
        media.ice_candidates_complete = True

        # remove a=ice-options: to prevent Trickle ICE, as we need to
        # generate all the candidates at once as we only get one chance to
        # answer over a REST call.
        media.ice_options = None

    return str(session_description)
