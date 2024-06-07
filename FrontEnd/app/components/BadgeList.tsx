import React from 'react';

const BadgeList = ({ badges }) => {
  return (
    <div>
      {badges.map((badge) => (
        <div key={badge.id}>
          <h3>{badge.code}</h3>
          <img src={badge.image} alt={`${badge.code} badge`} />
          <p>{badge.description_short}</p>
        </div>
      ))}
    </div>
  );
};

export default BadgeList;
