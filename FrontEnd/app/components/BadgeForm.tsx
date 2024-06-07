import React from 'react';

const BadgeForm = ({ badge, onChange, onSave }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onChange(name, value);
  };

  return (
    <form onSubmit={onSave}>
      <label>
        Code:
        <input type="text" name="code" value={badge.code} onChange={handleChange} />
      </label>
      <label>
        Issuer:
        <input type="text" name="issuer" value={badge.issuer} onChange={handleChange} />
      </label>
      <label>
        Difficulty:
        <input type="text" name="difficulty" value={badge.difficulty} onChange={handleChange} />
      </label>
      <label>
        Sub Difficulty:
        <input type="text" name="subDifficulty" value={badge.subDifficulty} onChange={handleChange} />
      </label>
      <label>
        Category Broad:
        <input type="text" name="category_broad" value={badge.category_broad} onChange={handleChange} />
      </label>
      <label>
        Category Narrow:
        <input type="text" name="category_narrow" value={badge.category_narrow} onChange={handleChange} />
      </label>
      <label>
        Description Short:
        <input type="text" name="description_short" value={badge.description_short} onChange={handleChange} />
      </label>
      <label>
        Description Long:
        <input type="text" name="description_long" value={badge.description_long} onChange={handleChange} />
      </label>
      <label>
        Current:
        <input type="checkbox" name="current" checked={badge.current} onChange={(e) => onChange('current', e.target.checked)} />
      </label>
      <label>
        Instructions:
        <input type="text" name="instructions" value={badge.instructions} onChange={handleChange} />
      </label>
      <label>
        Issue Date:
        <input type="text" name="issue_date" value={badge.issue_date} onChange={handleChange} />
      </label>
      <label>
        Image:
        <input type="text" name="image" value={badge.image} onChange={handleChange} />
      </label>
      <label>
        Type:
        <input type="text" name="type" value={badge.type} onChange={handleChange} />
      </label>
      <label>
        Aliases:
        <input type="text" name="aliases" value={badge.aliases} onChange={handleChange} />
      </label>
      <button type="submit">Save</button>
    </form>
  );
};

export default BadgeForm;
