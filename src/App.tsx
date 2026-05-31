import { useEffect, useMemo, useState } from 'react';

const productImages = import.meta.glob('../images/product_images/*.{png,jpg,jpeg,gif,webp}', { eager: true, import: 'default' });

const upcomingEvents: { title: string; location: string; date: string }[] = [];

function App() {
  const images = useMemo(
    () => Object.values(productImages).filter(Boolean) as string[],
    []
  );
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!images.length) return undefined;
    const interval = window.setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [images.length]);

  return (
    <div className="page-shell">
      <header className="site-header">
        <h1 className="brand-logo" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', margin: 0 }}>Critical Critter</h1>
        <div className="social-links">
        </div>
      </header>

      <main className="hero-section">
        <div className="hero-content">
          <div className="hero-copy">
            <span className="eyebrow">Coming Soon</span>
            <h1>Critical Critter</h1>
            <p>
              Stay tuned — something is coming.
            </p>
          </div>
          <div className="hero-image">
          </div>
        </div>
      </main>

      {images.length > 0 && (
        <section className="carousel-section">
          <div className="slider-container">
            <button
              className="slider-button slider-button-prev"
              onClick={() => setCurrent((prev) => (prev - 1 + images.length) % images.length)}
              aria-label="Previous image"
            >
              ←
            </button>
            <div className="carousel-viewport">
              <div className="carousel-track">
                {[-2, -1, 0, 1, 2].map((offset) => {
                  const imageIndex = (current + offset + images.length) % images.length;
                  const scaleClass = offset === 0 ? 'scale-large' : offset === -1 || offset === 1 ? 'scale-medium' : 'scale-small';
                  return (
                    <div key={offset} className={`carousel-item ${scaleClass}`}>
                      <img
                        src={images[imageIndex]}
                        alt={`Product ${imageIndex + 1}`}
                        className="carousel-image"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              className="slider-button slider-button-next"
              onClick={() => setCurrent((prev) => (prev + 1) % images.length)}
              aria-label="Next image"
            >
              →
            </button>
          </div>
        </section>
      )}

      {upcomingEvents.length > 0 && (
        <section className="upcoming-section">
          <div className="section-heading">
            <p className="section-label">Upcoming Events</p>
            <h2>2026 Calendar</h2>
          </div>
          <div className="event-grid">
            {upcomingEvents.map((event) => (
              <article key={event.title} className="event-card">
                <h3>{event.title}</h3>
                <p className="event-location">{event.location}</p>
                <p className="event-date">{event.date}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="site-footer">
        <p>Critical Critter — criticalcritter.com</p>
      </footer>
    </div>
  );
}

export default App;
