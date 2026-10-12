# Flusso punto foto

1. Creare o selezionare un progetto.
2. Nel box “Layer”, caricare una planimetria PNG, JPG, WEBP, GIF, DWG o DXF. Le immagini e i DXF supportati sono visualizzati nell'area di lavoro.
3. Posizionare i punti foto sul layer e assegnare a ciascuno un nome univoco. Tutti i punti vengono mostrati nel box laterale “Punto foto”.
4. Selezionare un punto dall'elenco e avviare la sessione QR. Il controller può cambiare punto attivo senza scollegare la camera.
5. Ogni foto viene autorizzata dalla sessione e salvata in `uploads/<progetto>/<punto-foto>`.
6. Chiudere un punto per bloccare nuovi scatti; è possibile riaprirlo senza perdere le foto già archiviate.

I nomi di progetto e area non possono contenere separatori di percorso o caratteri riservati.

Il DWG binario viene acquisito come layer del progetto, ma richiede ancora la conversione server-side in DXF per essere visualizzato nel browser.
