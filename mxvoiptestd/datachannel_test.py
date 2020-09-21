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

import asyncio
import logging

from aiortc import RTCSessionDescription, RTCPeerConnection, RTCDataChannel
from aiortc.sdp import SessionDescription

MAGIC_QUESTION = "Hello? Is this on?"
MAGIC_ANSWER = "Yes; yes, it is! :^)"

TIMEOUT_TIME = 300

logger = logging.getLogger(__name__)


async def setup_test(connection: RTCPeerConnection, offer) -> RTCSessionDescription:
    description = RTCSessionDescription(offer["sdp"], offer["type"])

    session_description = SessionDescription.parse(offer["sdp"])
    if len(session_description.media) != 1:
        raise ValueError("Only one media channel accepted.")

    media = session_description.media[0]
    if len(media.ice_candidates) != 1:
        raise ValueError("Only one ICE candidate accepted.")

    if not media.ice_candidates_complete:
        raise ValueError("ICE candidates must be completed")

    candidate = media.ice_candidates[0]

    await connection.setRemoteDescription(description)
    await connection.setLocalDescription(await connection.createAnswer())

    logger.debug(f"[{candidate}] Beginning test with this candidate…")

    @connection.on("datachannel")
    def on_datachannel(channel: RTCDataChannel):
        logger.debug(f"[{candidate}] Established an RTCDataChannel")

        @channel.on("message")
        def on_message(message):
            logger.debug(f"[{candidate}] Received a message")

            if message == MAGIC_QUESTION:
                channel.send(MAGIC_ANSWER)
            else:
                channel.close()
                asyncio.ensure_future(connection.close())

    # Make the connection time out
    asyncio.get_event_loop().call_later(
        TIMEOUT_TIME, asyncio.ensure_future, connection.close()
    )

    # this is the answer to return
    return connection.localDescription
