# Affidabilità scatto e salvataggio

- Uno scatto resta pendente fino alla ricezione completa nel browser.
- Il frame video corrente viene acquisito subito, senza attendere `ImageCapture.takePhoto()`.
- Compressione JPEG e invio iniziano nel task successivo, dopo aver fissato il momento dello scatto.
- I controller mostrano subito il frame congelato in una mini anteprima, senza fermare lo streaming principale.
- Il pulsante viene riabilitato mentre l’upload al server prosegue in una coda asincrona seriale.
- Lo stato mostra gli upload in corso e permette nuovi scatti.
- Dopo 75 secondi senza esito, la ricezione viene annullata e lo scatto può essere riprovato.
- Risposte riferite a uno scatto precedente non alterano lo stato dello scatto corrente.
- In modalità telefono singolo la foto viene prima salvata in IndexedDB, poi il pulsante di scatto viene riattivato.
- Gli upload dal telefono sono seriali e proseguono in background; in caso di errore la copia locale resta disponibile per la sincronizzazione manuale.
- Anche nella sessione remota ogni full-resolution viene salvata nella coda IndexedDB del telefono prima di riattivare lo scatto.
- Il trasferimento telefono-laptop è seriale e la copia locale viene rimossa solo dopo la conferma del salvataggio server.
