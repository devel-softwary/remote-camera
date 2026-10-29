# Fattibilità note cliente

Data analisi: 24 ottobre 2026.

## Stato implementazione

- 27 ottobre 2026: completata Fase 1. Aggiunti profili `generico | maradona`, migrazione dei progetti esistenti e validazione `TR01–TR28`, `A–D`, `N001–N100`.
- 27 ottobre 2026: completata Fase 2. Aggiunti dati strutturati del punto, gerarchia server Maradona, nome progressivo, deduplicazione degli upload e ZIP con radice `DAM`.
- 27 ottobre 2026: completata Fase 3. Aggiunti uso con un solo telefono, controlli locali, coda offline persistente e upload manuale o immediato senza live remoto.
- 27 ottobre 2026: completata Fase 4. Aggiunti diagnostica capability, focus manuale, touch-to-focus e flash fotografico condizionali.
- 27 ottobre 2026: ottimizzata l'interfaccia locale per il rilievo: punto attivo, zoom, focus e scatto restano nel pannello operativo mobile; opzioni secondarie raccolte separatamente.
- 29 ottobre 2026: spostato lo scatto al centro inferiore dell'anteprima e resi immediati punto, zoom, autofocus e torcia.

## Esito

Tutte le richieste sono realizzabili, con un limite: una web app non può garantire il salvataggio automatico in una cartella scelta della microSD. Per questo serve un'app Android o un'esportazione manuale.

La soluzione consigliata mantiene due modalità:

- **Remoto**: telefono camera e PC/secondo telefono controller.
- **Un solo telefono**: anteprima, comandi, scatto e selezione del nodo nello stesso dispositivo.

## Stato attuale

| Richiesta | Stato | Nota |
|---|---|---|
| Scatto dal telefono camera | Implementato | Disponibile tramite **Usa questo telefono**. |
| Zoom, torcia e autofocus | Implementato | Appaiono solo se browser e sensore dichiarano la capability. |
| Flash fotografico | Implementato con limite | Usa `ImageCapture.takePhoto()` solo quando il browser espone le modalità flash. La torcia resta un controllo distinto. |
| Messa a fuoco manuale/touch | Implementato con limite | I controlli appaiono solo quando dichiarati dal browser. |
| Struttura Maradona | Implementata | Usa `DAM/TRxx/FACCIA/Nxxx`. |
| Nome file richiesto | Implementato | Il server assegna il progressivo. |
| Salvataggio foto sul server | Configurabile | Remoto: automatico. Un solo telefono: manuale o immediato. |
| Sincronizzazione progetti/aree | Manuale | Avviene premendo **Sincronizza**. |
| Download ZIP | Su richiesta | Il server crea lo ZIP. I byte arrivano al dispositivo che avvia il download. |
| Copia locale sul telefono | Parziale | La coda IndexedDB conserva gli originali fino all'upload; non è una cartella pubblica o microSD. |

## Modalità “Un solo telefono”

Fattibilità: **alta**.

La pagina camera deve diventare una pagina operativa completa:

- scelta lavoro, traliccio, faccia e nodo;
- selezione fotocamera;
- zoom, torcia e autofocus quando supportati;
- pulsante di scatto locale;
- stato `locale`, `in attesa`, `caricata`, `errore`;
- coda di upload con comando esplicito **Sincronizza ora**;
- opzione **Carica subito** disattivabile.

In questa modalità non servono secondo telefono, PC, WebRTC o live video remoto. Lo scatto può essere caricato direttamente al server oppure conservato nella coda locale.

Lo storage browser, IndexedDB o OPFS, è privato al sito e soggetto a quota. Va chiesta la persistenza con `navigator.storage.persist()`, ma non deve essere considerato l'unica copia definitiva.

## Comandi fotocamera

Fattibilità web: **media e dipendente dal dispositivo**.

Lo standard web prevede zoom, torcia, modalità e distanza di messa a fuoco. Il browser espone solo ciò che supporta davvero il sensore. L'interfaccia deve quindi rilevare le capability e nascondere i comandi non disponibili.

Interventi:

1. riusare i controlli esistenti anche nella pagina camera;
2. aggiungere focus manuale e touch-to-focus solo quando esposti;
3. distinguere chiaramente **Torcia** da **Flash**;
4. aggiungere una schermata diagnostica con sensore e capability;
5. provare sui modelli Android/iPhone realmente usati dal cliente.

Per controlli coerenti su tutti i telefoni, flash incluso, serve una app nativa. La web app non può garantirli.

La matrice di collaudo è in [camera-device-matrix.md](camera-device-matrix.md).

Riferimento: [W3C MediaStream Image Capture](https://www.w3.org/TR/image-capture/).

## Struttura Maradona

Fattibilità: **alta**.

Struttura richiesta:

```text
DAM/
  TR01/
    A/
      N001/
        DAM_TR01_A_N001_fotogramma01.jpg
```

Regole:

- lavoro: `DAM`;
- traliccio: `TR01` … `TR28`;
- faccia: `A`, `B`, `C`, `D`;
- nodo: `N001` … `N100`;
- fotogramma: `fotogramma01`, `fotogramma02`, …;
- lavori generici: flusso attuale invariato.

Il server deve generare percorso, nome e progressivo. Non deve fidarsi di un percorso inviato dal client. Il progressivo deve essere assegnato senza collisioni e lo scatto deve avere un identificatore idempotente per evitare duplicati durante i retry.

Da confermare col cliente: `NOME_LAVORO` coincide sempre con `DAM` per Maradona e la faccia su disco deve essere maiuscola come nel nome file.

## Sincronizzazione e consumo dati

### Comportamento attuale

- La foto passa dal telefono al controller centrale.
- Il controller carica automaticamente l'originale sul server.
- Progetti e aree vengono sincronizzati solo premendo **Sincronizza**.
- Lo ZIP viene trasmesso dal server al browser che preme **Scarica ZIP**.
- Se il download parte dal telefono con rete mobile, consuma dati pari circa alla dimensione dello ZIP.
- Il live video remoto genera traffico continuo. Con TURN può transitare anche dal relay server.

### Comportamento consigliato

- Modalità predefinita in campo: **salva locale e sincronizza manualmente**.
- Upload automatico: opzionale e visibile.
- Nessuna rilevazione automatica “solo Wi-Fi”: il supporto browser non è abbastanza uniforme. Decide l'utente.
- Avviso con numero e dimensione totale prima dell'upload.
- Ripresa degli upload interrotti e deduplicazione server.
- Compressione e risoluzione configurabili, mantenendo un preset “qualità rilievo”.
- Nessun live remoto nella modalità a telefono singolo.
- Avviso con dimensione prima di scaricare lo ZIP da mobile.

Esempio: 100 foto da 5 MB richiedono circa 500 MB per un singolo upload. Scaricare poi lo ZIP sul telefono usa altri circa 500 MB. Il video remoto si aggiunge a questi valori.

## Salvataggio su memoria del telefono

### Web app

Fattibilità: **parziale**.

È possibile mantenere una coda offline nello storage privato del browser. Non è possibile garantire la scelta automatica della microSD o di una cartella pubblica. Un export manuale resta possibile tramite download.

### App Android

Fattibilità: **alta**.

Una app può usare lo Storage Access Framework. L'utente sceglie una cartella della memoria interna o della microSD e concede l'accesso. Questa è la soluzione robusta se la copia locale deve essere definitiva e navigabile fuori dall'app.

Riferimenti: [Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files), [WebKit Origin Private File System](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/).

## Sicurezza

- Token camera limitato a singolo lavoro e upload; niente token controller sul telefono.
- Validazione server di range ed enum Maradona.
- Verifica reale del formato immagine, non solo `Content-Type`.
- Limite dimensione, rate limit e quota per sessione.
- Originali non pubblici su URL prevedibili; download autorizzato.
- Retry idempotenti e scrittura atomica.
- Cifratura HTTPS obbligatoria.
- Cancellazione della coda locale solo dopo conferma server verificata.

## Piano proposto

### Fase 1 — requisiti e modello dati

Impegno: **basso**.

- confermare maiuscole, radice `DAM` e reset del progressivo;
- introdurre profilo lavoro `generico | maradona`;
- definire schema e migrazione senza modificare i lavori generici.

### Fase 2 — naming e archivio server

Impegno: **medio**.

- generatore server della gerarchia Maradona;
- progressivo sicuro e idempotenza;
- ZIP con la nuova struttura;
- test unitari su validazione, naming, collisioni e traversal.

### Fase 3 — uso con un solo telefono

Impegno: **medio-alto**.

- interfaccia locale conforme al design system;
- scatto senza controller;
- coda offline e sincronizzazione manuale;
- test unitari su stati, retry, deduplicazione e quota;
- test reali Android e iPhone.

### Fase 4 — controlli camera

Impegno: **medio**.

- controlli locali e diagnostica capability;
- focus manuale/touch quando supportato;
- matrice dispositivi supportati;
- valutazione app Android per flash e salvataggio microSD garantiti.

## Decisione consigliata

Le quattro fasi web sono implementate. Collaudare ora i telefoni reali del cliente. Valutare l'app Android solo se microSD e controlli camera uniformi sono requisiti obbligatori.
