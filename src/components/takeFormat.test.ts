import { describe, expect, it } from 'vitest';
import { serveFacts, tasteTags } from './takeFormat';

describe('tasting tags from "How it tastes"', () => {
  it('pulls the opening list into short tags and keeps the rest as text', () => {
    const t = tasteTags('Ripe red and black cherry, dried plum and vanilla, with leather, tobacco and sweet spice from long oak ageing. Medium-full body and fresh acidity; long and savoury.');
    expect(t.tags).toEqual(['Ripe red & black cherry', 'Dried plum', 'Vanilla', 'Leather', 'Tobacco', 'Sweet spice']);
    expect(t.rest).toBe('Medium-full body and fresh acidity; long and savoury.');
  });

  it('drops filler words, brackets and "from…" clauses', () => {
    expect(tasteTags('Red cherry, raspberry, garrigue (dried herbs) and a hint of spice from the oak. Light body.').tags).toEqual(['Red cherry', 'Raspberry', 'Garrigue', 'Spice']);
    expect(tasteTags('Expect dark cherry, plum and blackberry with savory notes of tobacco, cedar and leather. Firm tannins.').tags).toEqual(['Dark cherry', 'Plum', 'Blackberry', 'Tobacco', 'Cedar', 'Leather']);
  });

  it('keeps what follows the notes as text, with the describing word that goes with it', () => {
    const t = tasteTags('Red and black cherry, raspberry, garrigue and pepper, with a warm, round body and soft tannins. Approachable young.');
    expect(t.tags).toEqual(['Red & black cherry', 'Raspberry', 'Garrigue', 'Pepper']);
    expect(t.rest).toBe('Warm, round body and soft tannins. Approachable young.');
  });

  it('looks in the second sentence after an opening line', () => {
    const t = tasteTags('This is a modern, polished style. Expect dark cherry, plum, cocoa and spice, carried by firm tannins. The finish is long.');
    expect(t.tags).toEqual(['Dark cherry', 'Plum', 'Cocoa', 'Spice']);
    expect(t.rest).toBe('This is a modern, polished style. Firm tannins. The finish is long.');
  });

  it('shows only the text when there is no clean list of at least four notes', () => {
    const prose = 'Expect a light to medium-bodied red with fresh red cherry and strawberry fruit. Tannins are gentle.';
    expect(tasteTags(prose)).toEqual({ tags: [], rest: prose });
    expect(tasteTags('Cherry and plum. Soft.').tags).toEqual([]);
  });

  it('keeps at most six', () => {
    expect(tasteTags('Lime, lemon, grapefruit, green apple, white peach, white flowers, chalk and saline.').tags).toHaveLength(6);
  });
});

describe('serving tiles from "Serve it"', () => {
  it('reads temperature, decanting and the drink window, and the food', () => {
    expect(serveFacts('Serve at 16–18°C, decanted 30–60 minutes. Great with roast lamb, chorizo, or aged cheese. Drink now to 2035.')).toEqual({
      tiles: [
        { value: '16–18°', label: 'Celsius' },
        { value: '30–60′', label: 'Decant' },
        { value: '→ 2035', label: 'Drink window' },
      ],
      pairing: 'With roast lamb, chorizo, or aged cheese',
    });
  });

  it('understands the other ways it gets written', () => {
    const tiles = (t: string) => serveFacts(t)?.tiles.map((x) => x.value);
    expect(tiles('Serve at 16–18°C after a 1–2 hour decant. Drink 2025–2035.')).toEqual(['16–18°', '1–2 h', '2025–35']);
    expect(tiles('Serve slightly cool, around 14-16°C, with no need to decant. Best within about 3-5 years.')).toEqual(['14–16°', 'None', '3–5 yrs']);
    expect(tiles('Serve at 17°C. It is drinkable now, but best from about 2030 to 2045.')).toEqual(['17°', '2030–45']);
    expect(tiles('Serve at 16°C; a short decant for sediment. Ready now and will hold for years.')).toEqual(['16°', 'Short', 'Now']);
    expect(tiles('Serve at 55–60°F; decant for an hour.')).toEqual(['55–60°', '1 h']);
  });

  it('stops the food at the next clause', () => {
    expect(serveFacts('Serve at 16°C. It suits roast lamb, duck and hard cheeses, and will keep well for 10-15 years.')?.pairing).toBe('With roast lamb, duck and hard cheeses');
  });

  it('gives up (text as written) with fewer than two facts', () => {
    expect(serveFacts('Lovely with roast chicken. Enjoy it with friends.')).toBeNull();
    expect(serveFacts('Serve at 16°C.')).toBeNull();
  });
});
