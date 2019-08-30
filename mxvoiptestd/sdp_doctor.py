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
