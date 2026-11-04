# Schrijfsite

**Zet je eigen handschrift om in een alfabet en schrijf er elke tekst mee — op gelinieerd, blanco, geruit of ander papier.**

Een Next.js-website in krantenstijl (UnifrakturMaguntia, Instrument Serif, TeX Gyre Termes; palet papier `#E8E6E0`, grijs `#6E6F6B`, rood `#B0291F`).

## Wat kan het?

1. **Handschrift vastleggen** — drie manieren:
   - **Sjabloon scannen**: druk het A4-sjabloon af (`/sjabloon`), vul de vakjes in en upload een foto. De vier zwarte hoekvierkanten worden automatisch gevonden (ook bij scheve of omgedraaide foto's), het blad wordt rechtgezet en elk vakje wordt uitgeknipt en op de schrijflijn gezet.
   - **Op scherm tekenen** met muis, vinger of stylus (drukgevoelig).
   - **Foto + AI**: fotografeer een vel met losse letters; de AI (Google Gemini) zoekt en benoemt elk teken, waarna het wordt rechtgezet en geschaald.
2. **Analyse** — de AI controleert of elk vakje het juiste teken bevat, beschrijft de stijl (als krantenartikel) en adviseert spatiëring en natuurlijke variatie.
3. **Schrijven** — plak tekst en kies uit 12 papiersoorten (gelinieerd, blanco wit, ruitjes 5 mm / 1 cm, stippen, collegeblok, geel notitieblok, schrijflijnen, oud papier, kraftpapier, schoolbord, transparant), inkt, grootte en variatie. Accenten (é, ë, ï, ô …) worden automatisch samengesteld.
4. **Downloaden** als PNG, ZIP (alle pagina's) of PDF (A4, A5 of US Letter; 150–300 dpi).
5. **Account** — inloggen met e-mail en wachtwoord; handschriften en teksten worden opgeslagen in **Neon (PostgreSQL)**.

## Veiligheid

- De AI-sleutel (`GEMINI_API_KEY`) en de database-URL (`DATABASE_URL`) staan **alleen** als omgevingsvariabelen op de server (Vercel). Ze staan niet in de code en worden nooit naar de browser gestuurd; alle AI-verzoeken lopen via `/api/ai/*` en vereisen een ingelogde gebruiker.
- AI-gebruik is begrensd per gebruiker per dag (`AI_DAILY_LIMIT`, standaard 40).
- Wachtwoorden worden gehasht met scrypt; sessies zijn willekeurige tokens (alleen de SHA-256-hash staat in de database) in een `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Schrijfverzoeken van andere websites worden geweigerd (Origin-controle); mislukte inlogpogingen worden afgeremd.

## Lokaal draaien

```bash
npm install
cp .env.example .env.local   # vul DATABASE_URL en GEMINI_API_KEY in
npm run db:migrate           # maakt de tabellen aan (gebeurt ook automatisch bij de eerste aanvraag)
npm run dev
```

Lokaal mag `DATABASE_URL` ook naar een gewone PostgreSQL wijzen; voor Neon wordt automatisch de serverless HTTP-driver gebruikt.

## Omgevingsvariabelen

| Naam | Verplicht | Uitleg |
| --- | --- | --- |
| `DATABASE_URL` | ja | Neon connection string (pooled) |
| `GEMINI_API_KEY` | voor AI | Google Gemini API-sleutel |
| `GEMINI_MODELS` | nee | Komma-gescheiden modellen; de eerste beschikbare wordt gebruikt |
| `AI_DAILY_LIMIT` | nee | Max. AI-aanvragen per gebruiker per dag (standaard 40) |

## Techniek

- `src/lib/hw/` — de handschriftmotor (draait in de browser): sjabloon tekenen, markeringen zoeken + homografie, inkt extraheren, foto-segmentatie, renderer met papiersoorten, PDF- en ZIP-schrijver.
- `src/app/api/` — route handlers voor auth, handschriften, tekens, documenten en AI.
- `db/schema.sql` — databaseschema.

Lettertypen: TeX Gyre Termes (GUST Font License) wordt zelf gehost; overige via Google Fonts (OFL).
