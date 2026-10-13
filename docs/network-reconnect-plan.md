# Riconnessione camera

- La camera mantiene aperto lo stream locale durante una caduta di rete.
- WebSocket e peer WebRTC vengono ricreati con ritardo esponenziale da 1 a 30 secondi.
- Il token riusabile permette il riaggancio fino alla scadenza della sessione.
- La riconnessione si ferma per token non valido/scaduto o quando un'altra camera sostituisce il dispositivo.
- Una disconnessione WebRTC persistente per 5 secondi forza la ricostruzione del trasporto.
