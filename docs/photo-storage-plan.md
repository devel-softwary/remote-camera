# Salvataggio foto locale

- Ogni scatto viene salvato automaticamente dal server in `<storage>/<progetto>/<area>`.
- Per il profilo Maradona il percorso è `<storage>/DAM/TRxx/<faccia>/Nxxx` e il nome è `DAM_TRxx_<FACCIA>_Nxxx_fotogrammaNN.ext`.
- Traliccio, faccia, nodo e progressivo sono validati e generati dal server. I retry dello stesso scatto sono deduplicati nella sessione.
- `PHOTO_STORAGE_DIR` definisce la radice; senza variabile è `uploads` nel progetto.
- Docker monta `./uploads` dell'host in `/app/uploads`, così i file sopravvivono a riavvii e rebuild del container.
- Nomi di progetto e area sono validati prima di costruire il percorso.
- Le miniature JPEG sono salvate in IndexedDB nel browser del controller e usate nell'elenco foto; gli originali restano nello storage del server.
- Selezionando un progetto, il controller può scaricarlo in ZIP. Se necessario viene creata una sessione tecnica per autorizzare il download. L'archivio conserva la struttura generica o la radice `DAM/` e non espone il percorso dello storage.
