import { useState } from 'react';

/** Food photo with an emoji fallback (used when there is no photo or it fails to load). */
export default function FoodThumb({ image, emoji, size = 36 }) {
  const [broken, setBroken] = useState(false);
  const showImage = image && /^https:\/\//.test(image) && !broken;
  return (
    <span className="ft" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>
      {showImage
        ? <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <b className="font-normal leading-none">{emoji || '🍽️'}</b>}
    </span>
  );
}
