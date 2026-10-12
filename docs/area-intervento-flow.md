# Flusso area di intervento

1. Creare o selezionare un progetto.
2. Nel box “Layer”, caricare una planimetria PNG, JPG, WEBP, GIF, DWG o DXF. Le immagini e i DXF supportati sono visualizzati nell'area di lavoro.
3. Usare “Nuova area” e disegnare almeno tre vertici sul layer; alla conferma assegnare un nome univoco. Le aree precedenti senza geometria restano supportate.
4. Avviare la sessione QR: il token è riusabile fino alla scadenza ed è vincolato al progetto. Il controller centrale può cambiare l'area attiva senza scollegare la camera.
5. Ogni foto viene autorizzata dalla sessione e salvata in `uploads/<progetto>/<area>` dell'area attiva.
6. Chiudere l'area per bloccare nuovi scatti; è possibile riaprirla senza perdere le foto già archiviate.

I nomi di progetto e area non possono contenere separatori di percorso o caratteri riservati.

Il DWG binario viene acquisito come layer del progetto, ma richiede ancora la conversione server-side in DXF per essere visualizzato e usato come base di disegno nel browser.
