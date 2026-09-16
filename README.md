# Remote Camera POC

MVP per usare uno smartphone come camera remota e un PC/secondo smartphone come controller.

## Funzioni

- live video via WebRTC
- signaling e comando di scatto via WebSocket
- stanza con codice casuale
- QR code per aprire direttamente la camera del telefono
- secondo QR per un controller mobile concorrente
- camera anteriore/posteriore
- scatto remoto
- `ImageCapture.takePhoto()` quando supportato, con fallback a frame JPEG dal video
- aree di intervento nominate, con foto archiviate in `uploads/<progetto>/<area>`
- salvataggio automatico su disco locale; con Docker i file restano in `./uploads`
- STUN incluso; TURN configurabile via variabili d'ambiente

## Avvio rapido

```bash
npm install
npm start
```

Apri:

- Controller: `http://localhost:3000/controller.html`
- Camera: il link/QR viene generato dal controller.

## Importante: HTTPS

`getUserMedia()` richiede un **secure context**. `localhost` è consentito, ma su un telefono che apre `http://IP-DELLA-LAN:3000` la camera può essere bloccata dal browser.

Per test reali tra PC e smartphone esponi quindi il servizio in HTTPS, ad esempio dietro Caddy/Nginx.

Esempio Caddy:

```caddy
camera.example.com {
    reverse_proxy remote-camera:3000
}
```

Se Node gira fuori dalla rete Docker di Caddy:

```caddy
camera.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Imposta anche:

```env
PUBLIC_BASE_URL=https://camera.example.com
```

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Le foto vengono scritte automaticamente in `./uploads/<progetto>/<area>` sul computer host. Per l'avvio senza Docker, imposta `PHOTO_STORAGE_DIR` con un percorso assoluto, oppure usa la cartella `uploads` del progetto.

## Dispositivi su reti diverse

Lo STUN pubblico è sufficiente in molte reti, ma non in tutte. Per una soluzione affidabile serve un server TURN (ad esempio coturn):

```env
TURN_URL=turn:turn.example.com:3478
TURN_USERNAME=myuser
TURN_CREDENTIAL=mypassword
```

Per TURN TLS puoi usare, per esempio, `turns:turn.example.com:5349` se il server è configurato di conseguenza.

## Flusso

1. Apri `/controller.html` e crea un progetto.
2. Crea una sessione dalla colonna destra e scansiona il QR dallo smartphone.
3. Crea una o più aree di intervento e selezionane una.
4. Premi **Avvia camera** e concedi il permesso.
5. Scatta le foto: vengono archiviate nell'area selezionata. Cambia area per associare gli scatti successivi a un'altra cartella.
6. Chiudi l'area: le foto restano nella sua cartella; puoi aprirne un'altra.
7. Scansiona il QR del controller mobile dal laptop: mostra il video e consente scatto, zoom, torcia e autofocus senza modificare progetto o area.

## Limiti del POC

- le foto transitano come Data URL JSON su WebSocket: semplice, ma non ottimale per immagini molto grandi;
- non c'è autenticazione;
- una stanza supporta un controller centrale, un controller mobile e una camera; solo il centrale gestisce progetto, area e salvataggio;
- nessuna persistenza lato server;
- la PWA/browser deve restare attiva: schermo bloccato/background può sospendere camera e WebRTC;
- per produzione conviene trasferire la foto in binario o via upload HTTP firmato e aggiungere autenticazione, timeout e controllo accessi.

## Passo successivo consigliato

Per produzione:

- TURN/coturn;
- token di sessione monouso o riusabile, selezionabile dal controller;
- WebSocket autenticato;
- upload binario della foto;
- storage S3/Supabase;
- PWA installabile;
- comandi zoom/torcia/focus dove supportati;
- eventuale app Android nativa per funzionamento più robusto in background.
