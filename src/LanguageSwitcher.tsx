import { useLocale } from './locale-context'

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLocale()
  return (
    <label className="language-switcher">
      <span className="visually-hidden">Language / زبان</span>
      <select aria-label="Language / زبان" value={language} onChange={(event) => setLanguage(event.target.value === 'ur' ? 'ur' : 'en')}>
        <option value="en">English</option>
        <option value="ur">اردو</option>
      </select>
    </label>
  )
}
