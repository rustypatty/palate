/**
 * Where a wine region is, for the little map on the wine page: a point, the country it's in
 * (named as in the Natural Earth atlas) and a few big cities nearby to get your bearings.
 * Written into the app like regionGuide.ts, so nothing is looked up or stored per wine.
 */

export interface City {
  name: string;
  lat: number;
  lng: number;
}

export interface RegionPlace {
  lat: number;
  lng: number;
  /** Country name as in world-atlas, e.g. "United States of America". */
  country: string;
  /** More than are shown; the map keeps the first few that sit clear of the marker. */
  cities: City[];
}

const c = (name: string, lat: number, lng: number): City => ({ name, lat, lng });
const place = (lat: number, lng: number, country: string, cities: City[]): RegionPlace => ({ lat, lng, country, cities });

const US = 'United States of America';

const TURIN = c('Turin', 45.07, 7.69);
const MILAN = c('Milan', 45.46, 9.19);
const GENOA = c('Genoa', 44.41, 8.93);
const NICE = c('Nice', 43.7, 7.26);
const FLORENCE = c('Florence', 43.77, 11.26);
const ROME = c('Rome', 41.9, 12.5);
const BOLOGNA = c('Bologna', 44.49, 11.34);
const PERUGIA = c('Perugia', 43.11, 12.39);
const PISA = c('Pisa', 43.72, 10.4);
const PARIS = c('Paris', 48.86, 2.35);
const LYON = c('Lyon', 45.76, 4.84);
const MARSEILLE = c('Marseille', 43.3, 5.37);
const MONTPELLIER = c('Montpellier', 43.61, 3.88);
const VALENCE = c('Valence', 44.93, 4.89);
const GENEVA = c('Geneva', 46.2, 6.14);
const DIJON = c('Dijon', 47.32, 5.04);
const ORLEANS = c('Orléans', 47.9, 1.91);
const TOULOUSE = c('Toulouse', 43.6, 1.44);
const BORDEAUX = c('Bordeaux', 44.84, -0.58);
const BARCELONA = c('Barcelona', 41.39, 2.17);
const ZARAGOZA = c('Zaragoza', 41.65, -0.88);
const BILBAO = c('Bilbao', 43.26, -2.93);
const MADRID = c('Madrid', 40.42, -3.7);
const PORTO = c('Porto', 41.15, -8.61);
const FRANKFURT = c('Frankfurt', 50.11, 8.68);
const STUTTGART = c('Stuttgart', 48.78, 9.18);
const KOBLENZ = c('Koblenz', 50.36, 7.59);
const COLOGNE = c('Cologne', 50.94, 6.96);
const SF = c('San Francisco', 37.77, -122.42);
const SACRAMENTO = c('Sacramento', 38.58, -121.49);
const SAN_JOSE = c('San Jose', 37.34, -121.89);
const VIGO = c('Vigo', 42.24, -8.72);
const SANTIAGO_ES = c('Santiago', 42.88, -8.54);
const CHRISTCHURCH = c('Christchurch', -43.53, 172.64);

/** Famous appellations: their own point. Keys match APPELLATIONS in regionGuide.ts. */
const APPELLATIONS: Record<string, RegionPlace> = {
  Barolo: place(44.61, 7.94, 'Italy', [TURIN, MILAN, GENOA, NICE, c('Aosta', 45.74, 7.32), c('Parma', 44.8, 10.33)]),
  Barbaresco: place(44.73, 8.08, 'Italy', [TURIN, MILAN, GENOA, NICE, c('Aosta', 45.74, 7.32), c('Parma', 44.8, 10.33)]),
  'Brunello di Montalcino': place(43.06, 11.49, 'Italy', [FLORENCE, ROME, PERUGIA, BOLOGNA]),
  'Chianti Classico': place(43.55, 11.3, 'Italy', [PISA, BOLOGNA, PERUGIA, ROME, FLORENCE]),
  'Châteauneuf-du-Pape': place(44.06, 4.83, 'France', [LYON, MARSEILLE, MONTPELLIER, VALENCE]),
  Chablis: place(47.81, 3.8, 'France', [PARIS, DIJON, c('Troyes', 48.3, 4.08), ORLEANS]),
  Sancerre: place(47.33, 2.84, 'France', [ORLEANS, c('Bourges', 47.08, 2.4), c('Nevers', 46.99, 3.16), PARIS, c('Tours', 47.39, 0.69)]),
  Priorat: place(41.2, 0.83, 'Spain', [BARCELONA, c('Tarragona', 41.12, 1.25), ZARAGOZA, c('Valencia', 39.47, -0.38)]),
};

/** Every area in regionGuide.ts, for wines whose appellation has no point of its own. */
const AREAS: Record<string, RegionPlace> = {
  Burgundy: place(47.0, 4.85, 'France', [LYON, PARIS, GENEVA, c('Besançon', 47.24, 6.02), DIJON]),
  Bordeaux: place(44.9, -0.3, 'France', [TOULOUSE, c('La Rochelle', 46.16, -1.15), c('Limoges', 45.83, 1.26), BILBAO, BORDEAUX]),
  'Southern Rhône': place(44.1, 4.8, 'France', [LYON, MARSEILLE, MONTPELLIER, VALENCE]),
  'Northern Rhône': place(45.3, 4.8, 'France', [c('Grenoble', 45.19, 5.72), c('Saint-Étienne', 45.44, 4.39), GENEVA, c('Clermont-Ferrand', 45.78, 3.08), MARSEILLE, LYON]),
  Tuscany: place(43.4, 11.2, 'Italy', [FLORENCE, ROME, BOLOGNA, PERUGIA, PISA]),
  Piedmont: place(44.7, 8.0, 'Italy', [TURIN, MILAN, GENOA, NICE, c('Aosta', 45.74, 7.32), c('Parma', 44.8, 10.33)]),
  Loire: place(47.3, 0.7, 'France', [c('Nantes', 47.22, -1.55), ORLEANS, c('Angers', 47.47, -0.55), PARIS, c('Poitiers', 46.58, 0.34)]),
  Beaujolais: place(46.1, 4.7, 'France', [LYON, c('Mâcon', 46.31, 4.83), GENEVA, DIJON, c('Saint-Étienne', 45.44, 4.39)]),
  Veneto: place(45.5, 11.5, 'Italy', [c('Venice', 45.44, 12.32), c('Verona', 45.44, 10.99), MILAN, BOLOGNA, c('Trieste', 45.65, 13.78)]),
  Sonoma: place(38.5, -122.9, US, [SF, SACRAMENTO, SAN_JOSE, c('Oakland', 37.8, -122.27)]),
  Napa: place(38.5, -122.4, US, [SF, SACRAMENTO, SAN_JOSE, c('Santa Rosa', 38.44, -122.71)]),
  'Central Coast': place(35.7, -120.7, US, [c('Santa Barbara', 34.42, -119.7), c('Fresno', 36.74, -119.79), SAN_JOSE, c('Monterey', 36.6, -121.89), c('Los Angeles', 34.05, -118.24)]),
  Oregon: place(45.1, -123.1, US, [c('Portland', 45.52, -122.68), c('Eugene', 44.05, -123.09), c('Seattle', 47.61, -122.33), c('Salem', 44.94, -123.03)]),
  Rioja: place(42.3, -2.5, 'Spain', [BILBAO, c('Pamplona', 42.82, -1.64), ZARAGOZA, c('Burgos', 42.34, -3.7), c('Logroño', 42.47, -2.45)]),
  'Ribera del Duero': place(41.65, -3.7, 'Spain', [c('Valladolid', 41.65, -4.72), c('Burgos', 42.34, -3.7), MADRID, c('Segovia', 40.95, -4.12), c('Soria', 41.76, -2.47)]),
  'Castilla y León': place(41.7, -4.7, 'Spain', [c('Salamanca', 40.97, -5.66), c('León', 42.6, -5.57), MADRID, c('Burgos', 42.34, -3.7)]),
  Galicia: place(42.6, -8.1, 'Spain', [SANTIAGO_ES, VIGO, c('A Coruña', 43.36, -8.41), PORTO]),
  Catalonia: place(41.6, 1.6, 'Spain', [BARCELONA, c('Girona', 41.98, 2.82), c('Lleida', 41.62, 0.62), ZARAGOZA, c('Tarragona', 41.12, 1.25)]),
  Andalusia: place(36.9, -5.9, 'Spain', [c('Seville', 37.39, -5.98), c('Córdoba', 37.89, -4.78), c('Málaga', 36.72, -4.42), c('Cádiz', 36.53, -6.29), c('Granada', 37.18, -3.6)]),
  Douro: place(41.15, -7.6, 'Portugal', [PORTO, c('Braga', 41.55, -8.42), c('Coimbra', 40.21, -8.43), c('Salamanca', 40.97, -5.66)]),
  Minho: place(41.8, -8.3, 'Portugal', [PORTO, c('Braga', 41.55, -8.42), VIGO, SANTIAGO_ES]),
  Champagne: place(49.0, 3.9, 'France', [PARIS, c('Lille', 50.63, 3.06), c('Brussels', 50.85, 4.35), c('Metz', 49.12, 6.18), c('Troyes', 48.3, 4.08)]),
  Alsace: place(48.3, 7.4, 'France', [c('Strasbourg', 48.57, 7.75), c('Basel', 47.56, 7.59), STUTTGART, c('Nancy', 48.69, 6.18)]),
  Provence: place(43.5, 6.0, 'France', [MARSEILLE, NICE, c('Toulon', 43.12, 5.93), c('Avignon', 43.95, 4.81)]),
  Languedoc: place(43.5, 3.2, 'France', [MONTPELLIER, c('Perpignan', 42.7, 2.9), TOULOUSE, MARSEILLE]),
  'South-West France': place(44.0, 0.5, 'France', [TOULOUSE, BORDEAUX, c('Bayonne', 43.49, -1.47), c('Pau', 43.3, -0.37), c('Cahors', 44.45, 1.44)]),
  Sicily: place(37.6, 14.0, 'Italy', [c('Palermo', 38.12, 13.36), c('Catania', 37.5, 15.09), c('Messina', 38.19, 15.55), c('Trapani', 38.02, 12.51)]),
  Mosel: place(49.9, 7.0, 'Germany', [STUTTGART, c('Saarbrücken', 49.24, 7.0), c('Trier', 49.75, 6.64), KOBLENZ, c('Luxembourg', 49.61, 6.13), COLOGNE, FRANKFURT]),
  Rheingau: place(50.0, 8.0, 'Germany', [FRANKFURT, KOBLENZ, COLOGNE, STUTTGART]),
  Pfalz: place(49.4, 8.1, 'Germany', [FRANKFURT, STUTTGART, c('Strasbourg', 48.57, 7.75), c('Saarbrücken', 49.24, 7.0)]),
  Wachau: place(48.37, 15.4, 'Austria', [c('Vienna', 48.21, 16.37), c('Linz', 48.31, 14.29), c('Salzburg', 47.81, 13.04), c('Prague', 50.08, 14.44), c('Graz', 47.07, 15.44)]),
  Mendoza: place(-33.0, -68.8, 'Argentina', [c('Santiago', -33.45, -70.67), c('San Juan', -31.54, -68.54), c('San Luis', -33.3, -66.34), c('Córdoba', -31.42, -64.18)]),
  'South Australia': place(-34.6, 139.0, 'Australia', [c('Adelaide', -34.93, 138.6), c('Melbourne', -37.81, 144.96), c('Broken Hill', -31.96, 141.47), c('Mount Gambier', -37.83, 140.78)]),
  Marlborough: place(-41.5, 173.8, 'New Zealand', [c('Wellington', -41.29, 174.78), c('Nelson', -41.27, 173.28), c('Kaikōura', -42.4, 173.68), CHRISTCHURCH]),
  'Central Otago': place(-45.0, 169.2, 'New Zealand', [c('Dunedin', -45.87, 170.5), c('Invercargill', -46.41, 168.35), CHRISTCHURCH, c('Queenstown', -45.03, 168.66)]),
};

export function regionPlace(appellation: string | null, area: string): RegionPlace | null {
  return (appellation ? APPELLATIONS[appellation] : undefined) ?? AREAS[area] ?? null;
}
