import cafe from './assets/island-topic-cafe.webp';
import business from './assets/island-topic-business.webp';
import conversation from './assets/island-topic-conversation.webp';

const illustrations = new Map([
  ['672000000000000000001001', cafe],
  ['672500000000000000001001', business],
]);

/** @param {string} topicId */
export function topicIllustration(topicId) {
  return illustrations.get(topicId) ?? conversation;
}
