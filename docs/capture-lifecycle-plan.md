# Affidabilità scatto e salvataggio

- Uno scatto resta pendente fino alla ricezione completa nel browser.
- Il frame video corrente viene acquisito subito, senza attendere `ImageCapture.takePhoto()`.
- Compressione JPEG e invio iniziano nel task successivo, dopo aver fissato il momento dello scatto.
- I controller mostrano subito il frame congelato in una mini anteprima, senza fermare lo streaming principale.
- Il pulsante viene riabilitato mentre l’upload al server prosegue in una coda asincrona seriale.
- Lo stato mostra gli upload in corso e permette nuovi scatti.
- Dopo 75 secondi senza esito, la ricezione viene annullata e lo scatto può essere riprovato.
- Risposte riferite a uno scatto precedente non alterano lo stato dello scatto corrente.
