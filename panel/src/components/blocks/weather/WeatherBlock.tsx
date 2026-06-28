import type { ServerBlock } from '../../../schemas/blocks.server';

interface WeatherData {
  location?: string;
  temp?: string;
  condition?: string;
  rain_chance?: string;
  wind?: string;
  advice?: string;
}

export function WeatherBlock({ block }: { block: ServerBlock }) {
  const d = block.data as unknown as WeatherData;

  return (
    <div className="block weather">
      <div className="weather-head">
        <span className="weather-location">{d.location || 'Weather'}</span>
        {d.rain_chance ? <span className="weather-rain">rain {d.rain_chance}</span> : null}
      </div>
      <div className="weather-temp">{d.temp || '—'}</div>
      {d.condition ? <div className="weather-condition">{d.condition}</div> : null}
      {d.wind ? <div className="weather-wind">{d.wind}</div> : null}
      {d.advice ? <div className="weather-advice">{d.advice}</div> : null}
    </div>
  );
}
