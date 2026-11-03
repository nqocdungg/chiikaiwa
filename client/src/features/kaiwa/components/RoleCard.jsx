import { Icon } from '../../../components/ui/controls.jsx';

/** @param {{scenario: (typeof import('../../../demo/kaiwa-fixtures.js').scenarios)[number], roleIndex: number, translated: boolean, onTranslate: () => void, longContent: boolean}} props */
export function RoleCard({
  scenario,
  roleIndex,
  translated,
  onTranslate,
  longContent,
}) {
  const role = scenario.roles[roleIndex];
  const text = {
    name: translated ? role.nameVi : role.name,
    background: translated ? scenario.backgroundVi : scenario.background,
    situation: translated ? role.situationVi : role.situation,
    goal: translated ? role.goalVi : role.goal,
  };
  return (
    <article className="ck-role-card">
      <div className="ck-card-heading">
        <div>
          <span className="ck-shared-label">Tình huống chung</span>
          <h2 lang={translated ? 'vi' : 'ja'}>
            {translated ? scenario.vietnameseTitle : scenario.title}
          </h2>
        </div>
        <button
          type="button"
          className="ck-translate"
          aria-label={
            translated ? 'Xem thẻ tiếng Nhật' : 'Dịch thẻ sang tiếng Việt'
          }
          aria-pressed={translated}
          onClick={onTranslate}
        >
          <Icon name="translate" size={18} />
          {translated ? '日本語' : 'Tiếng Việt'}
        </button>
      </div>
      <div className="ck-shared-goal" lang={translated ? 'vi' : 'ja'}>
        {translated ? scenario.sharedGoalVi : scenario.sharedGoal}
      </div>
      <div className="ck-role-heading">
        <span className="ck-role-letter">{roleIndex === 0 ? 'A' : 'B'}</span>
        <div lang={translated ? 'vi' : 'ja'}>
          <span>{translated ? 'Tên vai' : '役割'}</span>
          <h3>{text.name}</h3>
        </div>
        <span className="ck-private-label">
          <Icon name="lock" size={12} />
          Chỉ bạn thấy
        </span>
      </div>
      <dl className="ck-role-fields" lang={translated ? 'vi' : 'ja'}>
        <div>
          <dt>{translated ? 'Bối cảnh' : '背景'}</dt>
          <dd>{text.background}</dd>
        </div>
        <div>
          <dt>{translated ? 'Tình huống' : '状況'}</dt>
          <dd>
            {longContent
              ? Array(6).fill(text.situation).join(' ')
              : text.situation}
          </dd>
        </div>
        <div>
          <dt>{translated ? 'Mục đích' : '目的'}</dt>
          <dd>{text.goal}</dd>
        </div>
      </dl>
      <div className="ck-starter" lang="ja">
        「{role.starter}」
      </div>
    </article>
  );
}
