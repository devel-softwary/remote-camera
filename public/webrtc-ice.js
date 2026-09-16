// ICE candidates may be signalled before the remote SDP. Keep them until it is set.
export async function addRemoteIceCandidate(peer, pendingCandidates, candidate) {
  if (!peer.remoteDescription?.type) {
    pendingCandidates.push(candidate);
    return;
  }
  await peer.addIceCandidate(candidate);
}

export async function flushRemoteIceCandidates(peer, pendingCandidates) {
  const candidates = pendingCandidates.splice(0);
  for (const candidate of candidates) await peer.addIceCandidate(candidate);
}
