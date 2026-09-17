# Piano: doppio controller concorrente

## Obiettivo

Una stessa sessione deve poter avere contemporaneamente:

- un controller centrale su laptop, titolare della sessione;
- un controller mobile, collegato alla stessa sessione;
- una sola camera.

Entrambi vedono stato, anteprima e risultati. Il laptop conserva le azioni di gestione; il mobile offre comandi rapidi sul campo.

## Ruoli e permessi

| Azione | Centrale | Mobile |
| --- | --- | --- |
| Creare/chiudere sessione | Sì | No |
| Gestire progetto, CAD e aree | Sì | Solo lettura |
| Avviare scatto, autofocus, torcia/zoom | Sì | Sì |
| Salvare foto nell'area selezionata | Sì | No |
| Vedere video e stato camera | Sì | Sì |

L'area attiva è unica e viene scelta dal controller centrale. Il mobile la visualizza prima di inoltrare uno scatto. La camera resta connessa quando l'area cambia; il server autorizza il salvataggio solo nell'area attiva del progetto della sessione.

## Architettura proposta

1. Sostituire il campo singolo `session.controller` con una raccolta di peer autenticati, indicizzati da `controllerId`.
2. Introdurre i ruoli WebSocket `controller-central` e `controller-mobile`; mantenere temporaneamente `controller` come alias del centrale per compatibilità.
3. Emettere un token separato per il mobile, incluso in un secondo QR/link. I token sono revocabili, hanno scadenza di sessione e non transitano nei log.
4. Pubblicare lo stato della sessione a tutti i peer: area attiva, camera connessa, comandi in corso, esito e metadati dello scatto.
5. Usare il WebSocket per presenza, autorizzazione e sincronizzazione. Creare una connessione WebRTC camera→controller per ciascun controller, con signaling indirizzato tramite `peerId`.
6. Il canale dati della camera riceve i comandi dal server solo dopo verifica di ruolo, sessione e area. La foto viene inviata una volta al server, che la salva e notifica entrambi i controller; non duplicarla su due canali dati.

## Interazione e conflitti

- Ogni comando ha `requestId`, `originControllerId` e timestamp.
- Una coda per camera serializza scatto, cambio camera, focus, torcia e zoom.
- Durante uno scatto, entrambi i pulsanti di scatto mostrano lo stato occupato.
- Il primo comando valido viene eseguito; gli altri ricevono `command-rejected` con motivo `camera-busy`.
- La disconnessione del mobile non interrompe camera né laptop. La disconnessione del laptop lascia il mobile in sola visualizzazione fino al rientro del centrale o alla scadenza.

## Fasi

1. Estrarre il modello di peer/sessione in moduli testabili e aggiungere l'API per generare/revocare il link mobile.
2. Adeguare il signaling WebSocket a peer multipli e a messaggi indirizzati; aggiornare il payload `session-status`.
3. Collegare la camera a più peer WebRTC e trasferire upload e notifiche foto attraverso il server.
4. Creare la vista mobile responsiva: video, area corrente, scatto e controlli camera; nessuna modifica a progetto/CAD/aree.
5. Aggiornare la vista laptop con QR/link mobile, elenco dispositivi collegati e revoca del controller mobile.
6. Aggiungere telemetria minima di sessione e test end-to-end su laptop + mobile + camera.

## Sicurezza

- Token diversi per centrale, mobile e camera, ad alta entropia e confrontati in tempo costante.
- Autorizzazione server-side per ogni comando e upload; il client non decide l'area di salvataggio.
- Limite a un mobile per default; la sostituzione richiede revoca esplicita dal laptop o un nuovo token.
- Rate limit per comandi e signaling, limiti payload, validazione schema e chiusura dei socket non validi.
- HTTPS/WSS obbligatori in produzione. Non inserire token in analytics, log applicativi o referer.

## Criteri di accettazione

- Laptop, mobile e camera restano collegati nella stessa sessione senza sostituzioni involontarie.
- Entrambi i controller ricevono video/stato e possono richiedere uno scatto.
- Ogni foto è archiviata una sola volta nell'area selezionata dal laptop e appare per entrambi.
- Un mobile non può creare sessioni, cambiare area o caricare foto direttamente.
- Revoca, scadenza o disconnessione di un controller non compromettono gli altri peer autorizzati.
