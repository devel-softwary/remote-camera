# Salvataggio foto locale

- Ogni scatto viene salvato automaticamente dal server in `<storage>/<progetto>/<area>`.
- `PHOTO_STORAGE_DIR` definisce la radice; senza variabile è `uploads` nel progetto.
- Docker monta `./uploads` dell'host in `/app/uploads`, così i file sopravvivono a riavvii e rebuild del container.
- Nomi di progetto e area sono validati prima di costruire il percorso.
- Le miniature JPEG sono salvate in IndexedDB nel browser del controller e usate nell'elenco foto; gli originali restano nello storage del server.
