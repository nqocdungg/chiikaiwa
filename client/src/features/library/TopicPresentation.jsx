import { Link } from 'react-router';
import { StudyIcon } from '../../components/ui/StudyIcon.jsx';
import { Badge } from '../../components/ui/surfaces.jsx';
import { islandAsset, topicArt } from './topic-art.js';

/** @param {{topic: Pick<import('./library-api.js').Topic, 'title' | 'level' | 'description'>, detail?: boolean}} props */
export function TopicPresentation({ topic, detail = false }) {
  const art = topicArt(topic);
  const Heading = detail ? 'h1' : 'h2';
  return (
    <div
      className={
        detail
          ? 'ck-topic-presentation ck-topic-presentation--detail'
          : 'ck-topic-presentation'
      }
    >
      <div className="ck-topic-presentation__heading">
        <span className="ck-topic-presentation__icon">
          <img src={art.icon} alt="" />
        </span>
        <div>
          <div className="ck-topic-presentation__title">
            <Heading>{topic.title}</Heading>
            <Badge tone="accent">{topic.level}</Badge>
          </div>
          {topic.description && <p>{topic.description}</p>}
        </div>
      </div>
      <img
        className="ck-topic-presentation__scene"
        src={art.illustration}
        alt=""
      />
    </div>
  );
}

const studyActions = [
  {
    id: 'knowledge',
    label: 'Kiến thức',
    description: 'Từ vựng và ngữ pháp quan trọng',
  },
  {
    id: 'flashcard',
    label: 'Flashcard',
    description: 'Ghi nhớ nhanh và hiệu quả',
  },
  { id: 'quiz', label: 'Quiz', description: 'Luyện tập và kiểm tra lại' },
];

/** @param {{detailPath: string, state?: unknown, detail?: import('./library-api.js').TopicDetail}} props */
export function TopicActions({ detailPath, state, detail }) {
  return (
    <nav
      className={
        detail ? 'ck-topic-detail__actions' : 'ck-topic-preview__actions'
      }
      aria-label="Học theo chủ đề"
    >
      {!detail && <h3>Nội dung bộ chủ đề</h3>}
      {studyActions.map(({ id, label, description }) => {
        if (
          detail &&
          ((id === 'flashcard' && !detail.knowledgeCount) ||
            (id === 'quiz' && !detail.questionCount))
        ) {
          return null;
        }
        const content = (
          <>
            <img
              src={islandAsset('study-' + id)}
              alt=""
              width="40"
              height="40"
            />
            <span>
              <strong>
                {detail && id === 'knowledge' ? 'Học kiến thức' : label}
              </strong>
              <small>{description}</small>
            </span>
            <StudyIcon name="chevron" size={18} />
          </>
        );
        return detail && id === 'knowledge' ? (
          <a key={id} href="#topic-knowledge" data-study={id}>
            {content}
          </a>
        ) : (
          <Link
            key={id}
            to={
              detailPath + (id === 'knowledge' ? '#topic-knowledge' : '/' + id)
            }
            state={state}
            data-study={id}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

/** @param {{to: import('react-router').To, state?: unknown, children: import('react').ReactNode}} props */
export function TopicBack({ to, state, children }) {
  return (
    <Link className="ck-topic-back" to={to} state={state}>
      <StudyIcon name="arrow" size={18} />
      {children}
    </Link>
  );
}
