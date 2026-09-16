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

export function webRtcFailureMessage(state) {
  if (state === 'failed') return 'Connessione video non riuscita. Se i dispositivi non sono sulla stessa rete, configura TURN sul server.';
  if (state === 'disconnected') return 'Connessione video interrotta. Verifica la rete del telefono.';
  return `WebRTC ${state}`;
}
