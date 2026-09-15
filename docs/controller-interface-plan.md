# Controller interface

Il controller usa un workspace responsivo a tre colonne:

- sinistra: progetto e file CAD;
- centro: video remoto, controlli, area CAD e foto;
- destra: sessione e QR code.

La selezione progetto e il riferimento al CAD rimangono locali al browser. Il file CAD viene validato (DWG/DXF, massimo 50 MB) prima di essere mostrato nell'area di lavoro. Un backend per upload e rendering CAD potrà sostituire questa persistenza locale.
