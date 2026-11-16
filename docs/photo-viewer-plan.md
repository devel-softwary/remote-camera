# Visualizzazione foto

- La galleria conserva le miniature per l'elenco e apre l'URL dell'originale nella modale.
- Le miniature sono caricate in modo asincrono solo quando si avvicinano alla viewport.
- Durante il caricamento viene mostrato un loader accessibile; in assenza di `IntersectionObserver` resta attivo il lazy loading nativo.
- Ogni foto può essere eliminata definitivamente dopo conferma; file, metadati e miniatura locale vengono rimossi insieme.
- Lo zoom iniziale adatta la foto allo spazio disponibile.
- I controlli arrivano al 100%, cioè alle dimensioni reali dell'immagine.
