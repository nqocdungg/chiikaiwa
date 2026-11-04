/**
 * Dữ liệu seed mẫu (DATA-001) phục vụ kiểm thử và làm chuẩn biên soạn.
 *
 * Tuân thủ nghiêm ngặt Database Design §7.1 & §7.2:
 * - contentId: Định danh ổn định của học liệu (content_items._id).
 * - versionId: Định danh bản xuất bản (content_versions._id), revision: 1.
 * - Tham chiếu giữa các bản xuất bản: dùng knowledgeVersionIds, questionVersionIds, scenarioVersionIds.
 */

export const sampleDataset = {
  knowledges: [
    {
      _id: '672000000000000000000001',
      contentId: '672000000000000000000001',
      versionId: '6720000000000000000000a1',
      revision: 1,
      type: 'vocabulary',
      expression: 'おすすめ',
      reading: 'おすすめ',
      meaning: 'Gợi ý, món khuyên dùng',
      examples: [
        {
          japanese: '本日のおすすめは何ですか。',
          vietnamese: 'Món gợi ý hôm nay của quán là gì vậy ạ?',
        },
      ],
    },
    {
      _id: '672000000000000000000002',
      contentId: '672000000000000000000002',
      versionId: '6720000000000000000000a2',
      revision: 1,
      type: 'grammar',
      expression: '〜をお願いします',
      reading: '〜をおねがいします',
      meaning: 'Làm ơn cho tôi... / Xin vui lòng...',
      examples: [
        {
          japanese: 'アイスコーヒーをお願いします。',
          vietnamese: 'Làm ơn cho tôi một cà phê đá.',
        },
      ],
    },
  ],

  questions: [
    {
      _id: '672000000000000000000011',
      contentId: '672000000000000000000011',
      versionId: '6720000000000000000000b1',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Khi muốn hỏi nhân viên 'Món gợi ý của quán là gì?', bạn nói thế nào?",
      options: [
        { id: 'opt_1', text: 'おすすめは何ですか。' },
        { id: 'opt_2', text: 'いくらですか。' },
        { id: 'opt_3', text: 'どこですか。' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'おすすめ' nghĩa là món gợi ý, món khuyên dùng của cửa hàng.",
      knowledgeVersionIds: ['6720000000000000000000a1'],
    },
    {
      _id: '672000000000000000000012',
      contentId: '672000000000000000000012',
      versionId: '6720000000000000000000b2',
      revision: 1,
      type: 'multipleChoice',
      prompt: 'Khi muốn gọi một ly cà phê nóng, bạn chọn câu nào?',
      options: [
        { id: 'opt_1', text: 'ホットコーヒーをお願いします。' },
        { id: 'opt_2', text: 'ホットコーヒーはおいしいです。' },
        { id: 'opt_3', text: 'ホットコーヒーではありません。' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "Mẫu câu danh từ + 'をお願いします' dùng khi gọi món hoặc nhờ vả lịch sự.",
      knowledgeVersionIds: ['6720000000000000000000a2'],
    },
    {
      _id: '672000000000000000000013',
      contentId: '672000000000000000000013',
      versionId: '6720000000000000000000b3',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền từ còn thiếu vào chỗ trống: 'アイスコーヒー（　）お願いします。'",
      acceptedAnswers: ['を', 'wo'],
      explanation: "Trợ từ 'を' đứng sau đối tượng được gọi món.",
      knowledgeVersionIds: ['6720000000000000000000a2'],
    },
  ],

  scenarios: [
    {
      _id: '672000000000000000000101',
      contentId: '672000000000000000000101',
      versionId: '6720000000000000000000c1',
      revision: 1,
      title: 'Gọi đồ uống tại quán cà phê',
      context:
        'Bạn đang ở một quán cà phê tại Tokyo và muốn gọi đồ uống phù hợp với sở thích.',
      objective:
        'Hỏi nhân viên về món gợi ý của quán và gọi thành công 1 đồ uống cùng 1 món bánh.',
      roleA:
        'Khách hàng: Bước vào quán, hỏi món gợi ý hôm nay và gọi món bằng tiếng Nhật.',
      roleB:
        'Nhân viên quán: Chào khách, giới thiệu món gợi ý và xác nhận lại đơn hàng.',
      hints: [
        'いらっしゃいませ (Kính chào quý khách)',
        'おすすめは何ですか (Gợi ý hôm nay là gì?)',
        '〜をお願いします (Làm ơn cho tôi...)',
      ],
      knowledgeVersionIds: [
        '6720000000000000000000a1',
        '6720000000000000000000a2',
      ],
      questionVersionIds: [
        '6720000000000000000000b1',
        '6720000000000000000000b2',
        '6720000000000000000000b3',
      ],
    },
  ],

  decks: [
    {
      _id: '672000000000000000001001',
      contentId: '672000000000000000001001',
      versionId: '6720000000000000000000d1',
      revision: 1,
      title: 'Quán cà phê & Nhà hàng',
      topicKey: 'cafe_and_restaurant',
      level: 'N5',
      description:
        'Luyện hội thoại gọi món, hỏi giá và thanh toán cơ bản trong quán cà phê.',
      scenarioVersionIds: ['6720000000000000000000c1'],
      knowledgeVersionIds: [
        '6720000000000000000000a1',
        '6720000000000000000000a2',
      ],
      questionVersionIds: [
        '6720000000000000000000b1',
        '6720000000000000000000b2',
        '6720000000000000000000b3',
      ],
    },
  ],
};
