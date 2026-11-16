# Salvataggio foto locale

- Ogni scatto viene salvato automaticamente dal server in `<storage>/<progetto>/<area>` con nome progressivo `01.ext`, `02.ext`, ecc.
- Per il profilo Maradona il percorso è `<storage>/DAM/TRxx/<faccia>/Nxxx` e il nome è `TRxx_<FACCIA>_Nxxx_NN.ext`.
- Traliccio, faccia, nodo e progressivo sono validati e generati dal server. I retry dello stesso scatto sono deduplicati nella sessione.
- `PHOTO_STORAGE_DIR` definisce la radice; senza variabile è `uploads` nel progetto.
- Docker monta `./uploads` dell'host in `/app/uploads`, così i file sopravvivono a riavvii e rebuild del container.
- Ogni upload restituisce anche `publicUrl`, un URL assoluto basato su `PUBLIC_BASE_URL`, utilizzabile nei file Excel.
- `PUBLIC_BASE_URL` deve essere un'origine pubblica HTTPS senza path, query o credenziali. Il reverse proxy deve inoltrare `/uploads/` al servizio.
- Gli URL foto sono leggibili senza sessione per consentire l'apertura da Excel. Non contengono percorsi locali; la directory blocca dotfile e content sniffing.
- Nomi di progetto e area sono validati prima di costruire il percorso.
- Le miniature JPEG sono salvate in IndexedDB nel browser del controller e usate nell'elenco foto; gli originali restano nello storage del server.
- Durante ricezione e upload, l'elenco mostra come placeholder la mini-anteprima JPEG acquisita al momento dello scatto.
- Sotto ogni miniatura viene mostrato il nome del file; durante l'upload compare uno stato temporaneo fino all'assegnazione server.
- In modalità **Usa questo telefono**, gli originali entrano prima in una coda IndexedDB. La coda è ripresa dalle nuove sessioni dello stesso progetto e rimossa solo dopo la conferma server.
- Selezionando un progetto, il controller può scaricarlo in ZIP. Se necessario viene creata una sessione tecnica per autorizzare il download. L'archivio conserva la struttura generica o la radice `DAM/` e non espone il percorso dello storage.
- Per ogni nodo Maradona il download Excel è disponibile sia nella lista laterale sia accanto al nome sopra le foto. Contiene commessa, traliccio, ID nodo e link pubblico di ogni foto. La commessa usa `MARADONA_JOB_CODE`, con fallback temporaneo `XXXX`.
