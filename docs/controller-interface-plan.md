# Controller interface

Il controller usa un workspace responsivo a tre colonne:

- sinistra: progetto e layer immagine/CAD;
- centro: video remoto, controlli, area layer e foto;
- destra: sessione e QR code.

La selezione progetto e il riferimento al layer rimangono locali al browser. Sono accettate immagini PNG/JPG/WEBP/GIF fino a 20 MB e file DWG/DXF fino a 50 MB. Immagini e DXF sono renderizzati localmente con zoom e punti foto; il disegno poligonale delle aree sul layer è disabilitato. Il rendering di un DWG binario richiede un convertitore DWG→DXF lato server.

La sessione può usare un token monouso (predefinito) o riusabile. Un token riusabile consente allo stesso QR di riagganciare la camera fino alla scadenza della sessione; trattandosi di un segreto di accesso, va condiviso solo con il dispositivo autorizzato.
