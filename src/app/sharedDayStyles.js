export const SHARED_DAY_STYLES = `
.shared-day .shared-day__header{margin-top:14px;padding:12px 14px;border-radius:16px}
.shared-day__brand{display:flex;min-width:0;align-items:center;gap:8px;color:#0b1f2c}
.shared-day__logo{flex:none;width:22px;height:22px}
.shared-day__brand-name{flex:none;font-size:14px;font-weight:800}
.shared-day .shared-day__brand h1{min-width:0;margin:0;padding-left:8px;border-left:1px solid #dfe6e7;color:#203238;font-size:13.5px;font-weight:600;line-height:1.3;letter-spacing:0}
.shared-day__cities{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:8px 0 0;color:#26343a;font-size:13px;font-weight:600}
.shared-day__city{display:inline-flex;align-items:center;gap:6px}
.shared-day__city img{width:18px;height:12px;border-radius:2px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.shared-day__cities small{color:#667085;font-size:12px;font-weight:500}
.shared-day__map{width:100%;height:100%}
.shared-day__map-error{display:grid;height:100%;margin:0;place-items:center;color:#66767d;font-size:13px}
.shared-day__marker{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border:2px solid #fff;border-radius:50%;color:#fff;font:700 13px var(--font-body,inherit);box-shadow:0 2px 6px rgba(20,36,43,.3)}
.shared-day__actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.shared-day__maps-btn{display:flex;min-height:46px;align-items:center;justify-content:center;gap:8px;padding:0 16px;border-radius:14px;background:var(--marina,#0e4f63);color:#fff;font-size:14px;font-weight:700;text-decoration:none}
.shared-day__list{margin-top:14px;padding:6px 14px;border:1px solid #dfe6e7;border-radius:16px;background:#fff;box-shadow:0 7px 24px rgba(21,44,52,.07)}
.shared-day__place{display:grid;min-height:56px;grid-template-columns:28px minmax(0,1fr) 16px;align-items:center;gap:12px;color:#0b1f2c;text-decoration:none}
.shared-day__num{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-size:13px;font-weight:700}
.shared-day__text{min-width:0}
.shared-day__text strong{display:block;overflow:hidden;font-size:14.5px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.shared-day__text small{display:block;overflow:hidden;margin-top:2px;color:#5b6080;font-size:12px;text-overflow:ellipsis;white-space:nowrap}
.shared-day__ext{color:#98a2b3}
.shared-day__leg{display:flex;flex-direction:column;gap:6px;margin-left:13px;padding:4px 0 6px 22px;border-left:2px dashed #c9ced7;color:#5b6080;font-size:12.5px;font-weight:500}
.shared-day__leg.is-empty{min-height:10px;padding:0}
.shared-day__leg-head{display:flex;align-items:center;gap:8px}
.shared-day__step{display:flex;flex-direction:column;gap:3px}
.shared-day__step-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:#0b1f2c;font-weight:600}
.shared-day__step-head small{color:#667085;font-size:11.5px;font-weight:500}
.shared-day__step p{margin:0;color:#425158;font-size:12px;line-height:1.35}
.shared-day__line{display:inline-flex;min-width:22px;height:20px;align-items:center;justify-content:center;padding:0 6px;border-radius:5px;font-size:11.5px;font-weight:700}
/* Móvil: el mapa ocupa todo el ancho y casi toda la altura de la pantalla, sin
   tarjeta. Deja una franja de 88 px para ver que abajo sigue la lista y poder
   desplazarse (el mapa se mueve con un dedo). */
@media(max-width:720px){
.shared-itinerary.shared-day{padding:0 12px 40px}
.shared-day .shared-itinerary__map-card{height:calc(100dvh - 88px);min-height:320px;margin:0 -12px;border:0;border-radius:0;box-shadow:none}
}
`;
