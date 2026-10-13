# Affidabilità scatto e salvataggio

- Uno scatto resta pendente fino alla conferma del salvataggio remoto.
- Il frame video corrente viene acquisito subito, senza attendere `ImageCapture.takePhoto()`.
- Compressione JPEG e invio iniziano nel task successivo, dopo aver fissato il momento dello scatto.
- I controller mostrano subito il frame congelato in una mini anteprima, senza fermare lo streaming principale.
- Il pulsante resta disabilitato durante trasferimento e upload.
- Dopo 75 secondi senza esito, il caricamento viene annullato e lo scatto può essere riprovato.
- Risposte riferite a uno scatto precedente non alterano lo stato dello scatto corrente.
