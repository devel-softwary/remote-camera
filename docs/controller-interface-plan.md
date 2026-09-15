# Controller interface

Il controller usa un workspace responsivo a tre colonne:

- sinistra: progetto e file CAD;
- centro: video remoto, controlli, area CAD e foto;
- destra: sessione e QR code.

La selezione progetto e il riferimento al CAD rimangono locali al browser. Il file CAD viene validato (DWG/DXF, massimo 50 MB) prima di essere mostrato nell'area di lavoro. I DXF sono renderizzati localmente con zoom e punti foto; ogni punto può generare un QR per una sessione dedicata. Il rendering di un DWG binario richiede un convertitore DWG→DXF lato server.
