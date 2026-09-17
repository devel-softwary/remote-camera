# Flusso area di intervento

1. Creare o selezionare un progetto.
2. Con un DXF visualizzato, usare “Nuova area” e disegnare almeno tre vertici sulla planimetria; alla conferma assegnare un nome univoco. Le aree precedenti senza geometria restano supportate.
3. Avviare la sessione QR: il token è riusabile fino alla scadenza ed è vincolato alla coppia progetto-area.
4. Ogni foto viene autorizzata dalla sessione e salvata in `uploads/<progetto>/<area>` associata al token.
5. Chiudere l'area per bloccare nuovi scatti; è possibile riaprirla senza perdere le foto già archiviate.

I nomi di progetto e area non possono contenere separatori di percorso o caratteri riservati.

Il DWG binario richiede ancora la conversione server-side in DXF prima di poter essere disegnato nel browser.
