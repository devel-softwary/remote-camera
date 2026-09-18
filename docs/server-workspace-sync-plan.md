# Persistenza workspace

Il server archivia progetti e aree in `data/workspace.json` (configurabile con `WORKSPACE_STORAGE_FILE`).

Il pulsante **Sincronizza** invia lo storage locale al server, unisce le modifiche per progetto e area e salva il risultato sia sul server sia nel browser. Le foto restano deduplicate per id o URL.
