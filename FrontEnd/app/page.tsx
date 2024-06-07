'use client';

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Select from 'react-select';
import styles from './page.module.css';

interface Badge {
  id: number;
  code: string;
  issuer: string;
  difficulty: string;
  subDifficulty: string;
  category_broad: string;
  category_narrow: string;
  description_short: string;
  description_long: string;
  current: number;
  instructions: string;
  issue_date: string;
  image: string;
  type: string;
  aliases: string[];
}

export default function Home() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [aliasOptions, setAliasOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    fetch('/api/badges')
      .then((response) => response.json())
      .then((data) => {
        setBadges(data);
        setAliasOptions(
          data.map((badge: Badge) => ({
            value: `${badge.code}:${badge.issuer}`,
            label: `${badge.code}`,
          }))
        );
      });
  }, []);

  const handleBadgeClick = (badge: Badge) => {
    setSelectedBadge({
      ...badge,
      aliases: Array.isArray(badge.aliases) ? badge.aliases : [],
    });
  };

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBadge) return;

    const formData = new FormData(event.target as HTMLFormElement);
    const updatedBadge: Badge = {
      ...selectedBadge,
      ...Object.fromEntries(formData.entries()),
      aliases: formData.getAll('aliases') as string[],
    };

    await fetch(`/api/badges/${selectedBadge.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedBadge),
    });

    setSelectedBadge(null);
    // Refresh the list
    fetch('/api/badges')
      .then((response) => response.json())
      .then((data) => setBadges(data));
  };

  const filteredAliasOptions = aliasOptions.filter(
    (option) =>
      !selectedBadge ||
      !selectedBadge.aliases.includes(option.value) &&
      option.value !== `${selectedBadge.code}:${selectedBadge.issuer}`
  );

  return (
    <div className={styles.container}>
      <Head>
        <title>Badge Database</title>
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>Badge Database</h1>

        <div className={styles.grid}>
          {badges.map((badge) => (
            <div key={badge.id} className={styles.card} onClick={() => handleBadgeClick(badge)}>
              <img src={badge.image} alt={badge.description_short} className={styles.badgeImage} />
              <h2>{badge.code}</h2>
            </div>
          ))}
        </div>

        {selectedBadge && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <button className={styles.modalClose} onClick={() => setSelectedBadge(null)}>
                ×
              </button>
              <h2>Edit Badge</h2>
              <form onSubmit={handleFormSubmit} className={styles.formGrid}>
                <input type="hidden" name="id" value={selectedBadge.id} />
                <label className={styles.formLabel}>
                  Code:
                  <input type="text" name="code" defaultValue={selectedBadge.code} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Issuer:
                  <input type="text" name="issuer" defaultValue={selectedBadge.issuer} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Difficulty:
                  <input type="text" name="difficulty" defaultValue={selectedBadge.difficulty} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Sub Difficulty:
                  <input type="text" name="subDifficulty" defaultValue={selectedBadge.subDifficulty} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Category Broad:
                  <input type="text" name="category_broad" defaultValue={selectedBadge.category_broad} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Category Narrow:
                  <input type="text" name="category_narrow" defaultValue={selectedBadge.category_narrow} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Description Short:
                  <input type="text" name="description_short" defaultValue={selectedBadge.description_short} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Description Long:
                  <textarea name="description_long" defaultValue={selectedBadge.description_long} className={styles.formTextarea}></textarea>
                </label>
                <label className={styles.formLabel}>
                  Image URL:
                  <input type="text" name="image" defaultValue={selectedBadge.image} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Current:
                  <input type="checkbox" name="current" defaultChecked={selectedBadge.current === 1} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Instructions:
                  <textarea name="instructions" defaultValue={selectedBadge.instructions} className={styles.formTextarea}></textarea>
                </label>
                <label className={styles.formLabel}>
                  Issue Date:
                  <input type="text" name="issue_date" defaultValue={selectedBadge.issue_date} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Type:
                  <input type="text" name="type" defaultValue={selectedBadge.type} className={styles.formInput} />
                </label>
                <label className={styles.formLabel}>
                  Aliases:
                  <Select
                    isMulti
                    name="aliases"
                    options={filteredAliasOptions}
                    defaultValue={Array.isArray(selectedBadge.aliases) ? selectedBadge.aliases.map((alias: string) => {
                      const [code, issuer] = alias.split(':');
                      return { value: alias, label: code };
                    }) : []}
                    classNamePrefix="react-select"
                    className={styles.formSelect}
                  />
                </label>
                <button type="submit" className={styles.formButton}>Save</button>
                <button type="button" onClick={() => setSelectedBadge(null)} className={styles.cancelButton}>Cancel</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
