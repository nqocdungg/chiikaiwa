/** @typedef {'selecting'|'drawing'|'practice'|'reconnecting'|'sharing'|'exhausted'|'ended'} Stage */
/** @typedef {'selecting'|'drawing'|'practice'|'exhausted'} Phase */
/** @typedef {'hints'|'note'|'chat'} Panel */

export const stages = {
  selecting: 'Chọn bộ',
  drawing: 'Bốc thẻ',
  practice: 'Luyện hội thoại',
  reconnecting: 'Mất kết nối',
  sharing: 'Chia sẻ màn hình',
  exhausted: 'Hết thẻ',
  ended: 'Tổng kết',
};

export const decks = [
  { title: 'Một buổi hẹn cà phê', level: 'N4', count: 3 },
  { title: 'Mua sắm cuối tuần', level: 'N4', count: 5 },
  { title: 'Hỏi đường trong thành phố', level: 'N5', count: 5 },
  { title: 'Giới thiệu bản thân', level: 'N5', count: 5 },
  { title: 'Một chuyến tàu', level: 'N4', count: 5 },
  { title: 'Đặt phòng khách sạn', level: 'N3', count: 5 },
  { title: 'Ăn trưa cùng đồng nghiệp', level: 'N3', count: 5 },
  { title: 'Cuộc hẹn cuối tuần', level: 'N4', count: 5 },
  { title: 'Trao đổi kế hoạch', level: 'N2', count: 5 },
  { title: 'Thảo luận một ý kiến', level: 'N1', count: 5 },
];

// Authored bilingual fixtures only. Real room DTOs must contain just the assigned role.
export const scenarios = [
  {
    title: 'カフェで注文する',
    vietnameseTitle: 'Gọi món tại quán cà phê',
    background: '午後、小さなカフェに来ました。',
    backgroundVi: 'Bạn ghé một quán cà phê nhỏ vào buổi chiều.',
    sharedGoal: '飲み物を選んで、注文を確認しましょう。',
    sharedGoalVi: 'Chọn đồ uống và xác nhận lại món đã gọi.',
    roles: [
      {
        name: 'お客さん',
        nameVi: 'Khách hàng',
        situation:
          '甘すぎない、ミルクなしの飲み物を探しています。おすすめと値段を聞いてください。',
        situationVi:
          'Bạn tìm đồ uống ít ngọt, không có sữa. Hãy hỏi món được gợi ý và giá.',
        goal: '希望に合う飲み物を注文する。',
        goalVi: 'Gọi được đồ uống phù hợp với nhu cầu.',
        starter: 'おすすめは何ですか。',
      },
      {
        name: '店員',
        nameVi: 'Nhân viên',
        situation:
          '初めて来たお客さんに、飲み物を紹介してください。甘さやミルクについて確認してください。',
        situationVi:
          'Giới thiệu đồ uống cho một vị khách mới. Hỏi rõ nhu cầu về độ ngọt và sữa.',
        goal: '希望を聞いて、注文を確認する。',
        goalVi: 'Hỏi nhu cầu và xác nhận lại món khách gọi.',
        starter: '何になさいますか。',
      },
    ],
  },
  {
    title: 'おすすめを聞く',
    vietnameseTitle: 'Hỏi món được gợi ý',
    background: '友達とカフェのメニューを見ています。',
    backgroundVi: 'Bạn cùng một người bạn xem thực đơn tại quán cà phê.',
    sharedGoal: '好みを伝えて、飲み物を決めましょう。',
    sharedGoalVi: 'Trao đổi sở thích và chọn đồ uống.',
    roles: [
      {
        name: '相談する人',
        nameVi: 'Người xin gợi ý',
        situation:
          'コーヒーがあまり好きではありません。友達におすすめを聞いてください。',
        situationVi:
          'Bạn không thích cà phê lắm. Hãy nhờ bạn mình gợi ý món khác.',
        goal: '好みを説明して、一つ選ぶ。',
        goalVi: 'Nói rõ sở thích và chọn một món.',
        starter: '何がおすすめですか。',
      },
      {
        name: 'おすすめする人',
        nameVi: 'Người gợi ý',
        situation:
          '友達の好きな味を聞いて、メニューから飲み物を紹介してください。',
        situationVi:
          'Hỏi hương vị bạn mình thích rồi gợi ý đồ uống trong thực đơn.',
        goal: '理由を添えて、おすすめする。',
        goalVi: 'Gợi ý một món và giải thích lý do.',
        starter: 'どんな味が好きですか。',
      },
    ],
  },
  {
    title: '注文を変更する',
    vietnameseTitle: 'Thay đổi món đã gọi',
    background: '飲み物を注文した後で、変更したいことがありました。',
    backgroundVi: 'Sau khi gọi đồ uống, bạn có một yêu cầu muốn thay đổi.',
    sharedGoal: '変更できるか確認して、注文を決めましょう。',
    sharedGoalVi: 'Hỏi khả năng thay đổi và xác nhận món cuối cùng.',
    roles: [
      {
        name: 'お客さん',
        nameVi: 'Khách hàng',
        situation:
          '冷たい飲み物を頼みましたが、温かいものに変更したいです。丁寧にお願いしてください。',
        situationVi:
          'Bạn đã gọi đồ uống lạnh nhưng muốn đổi sang nóng. Hãy đề nghị lịch sự.',
        goal: '変更をお願いして、お礼を言う。',
        goalVi: 'Đề nghị thay đổi và nói lời cảm ơn.',
        starter: 'すみません、変更できますか。',
      },
      {
        name: '店員',
        nameVi: 'Nhân viên',
        situation:
          'お客さんが注文を変更したいと言っています。希望を聞いて、もう一度確認してください。',
        situationVi:
          'Khách muốn thay đổi món đã gọi. Hỏi rõ yêu cầu rồi xác nhận lại.',
        goal: '変更後の注文を確認する。',
        goalVi: 'Xác nhận món sau khi thay đổi.',
        starter: '温かいものですね。',
      },
    ],
  },
];

export const knowledge = [
  {
    id: 'osusume',
    word: 'おすすめ',
    reading: 'osusume',
    meaning: 'Món / lựa chọn được gợi ý',
    example: 'おすすめは何ですか。',
  },
  {
    id: 'amasa',
    word: '甘さ控えめ',
    reading: 'amasa hikaeme',
    meaning: 'Ít ngọt',
    example: '甘さ控えめでお願いします。',
  },
  {
    id: 'miruku',
    word: 'ミルクなし',
    reading: 'miruku nashi',
    meaning: 'Không có sữa',
    example: 'ミルクなしでお願いできますか。',
  },
];
