// Dialogflow ES webhook for a weather bot.
// Deploy as api/webhook.js on Vercel (free Hobby plan).
// Uses Open-Meteo: free, no API key, no sign-up.

module.exports = async (req, res) => {
  try {
    const params = (req.body && req.body.queryResult && req.body.queryResult.parameters) || {};
    const city = params['geo-city'];
    // Agent may use @sys.date ("date") or @sys.date-time ("date-time").
    // date-time can be a string or an object like {startDateTime, endDateTime} / {date_time}.
    let date = params['date-time'] || params['date'] || '';
    if (date && typeof date === 'object') {
      date = date.date_time || date.startDateTime || date.startDate || '';
    }

    if (!city) {
      return res.json({ fulfillmentText: 'Which city do you want the weather for?' });
    }

    // 1. City name -> coordinates
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    ).then(r => r.json());

    if (!geo.results || !geo.results.length) {
      return res.json({ fulfillmentText: `I couldn't find "${city}". Try another city name.` });
    }
    const { latitude, longitude, name } = geo.results[0];

    // 2. Coordinates -> current weather + 7-day forecast
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`
    ).then(r => r.json());

    let text;
    const day = date ? String(date).slice(0, 10) : null;

    if (day) {
      const i = w.daily.time.indexOf(day);
      if (i === -1) {
        text = `I can only forecast the next 7 days for ${name}. Try a nearer date.`;
      } else {
        text = `${name} on ${day}: ${describe(w.daily.weather_code[i])}, ` +
               `${w.daily.temperature_2m_min[i]}–${w.daily.temperature_2m_max[i]}°C, ` +
               `${w.daily.precipitation_probability_max[i]}% chance of rain.`;
      }
    } else {
      text = `Right now in ${name}: ${describe(w.current.weather_code)}, ` +
             `${w.current.temperature_2m}°C, wind ${w.current.wind_speed_10m} km/h.`;
    }

    return res.json({ fulfillmentText: text });
  } catch (err) {
    return res.json({ fulfillmentText: 'The weather service did not respond. Please try again.' });
  }
};

// WMO weather codes -> plain words
function describe(code) {
  if (code === 0) return 'clear sky';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain showers';
  if (code <= 86) return 'snow showers';
  return 'thunderstorm';
}
