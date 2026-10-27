# Persistenza workspace

Il server archivia progetti e aree in `data/workspace.json` (configurabile con `WORKSPACE_STORAGE_FILE`).

Il pulsante **Sincronizza** invia lo storage locale al server, unisce le modifiche per progetto e area e salva il risultato sia sul server sia nel browser. Le foto restano deduplicate per id o URL.

La modalità **Usa questo telefono** sincronizza il workspace prima dell'avvio. Gli scatti vengono accodati in IndexedDB e aggiunti al workspace server dopo l'upload. Una nuova sessione dello stesso progetto può riprendere la coda rimasta sul dispositivo.

In Docker la directory `data/` è già presente nel repository e viene montata con l’utente host. Dopo un aggiornamento, ricrea il container (`docker compose up -d --build`). Se esisteva una directory `data` creata da root, esegui `sudo chown -R "$(id -u):$(id -g)" data` una sola volta.
