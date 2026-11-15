/**
 * Dữ liệu seed học liệu cấp độ N1 (DATA-005, PB-31).
 *
 * Tuân thủ nghiêm ngặt Database Design §7.1 & §7.2 và checklist PB-31:
 * - 05 tình huống giao tiếp N1 cao cấp (Thương thảo, xử lý khủng hoảng, tranh biện điều hành).
 * - 10 mục kiến thức N1 (Ngữ pháp N1 và từ vựng thương mại chuẩn mực, đủ ví dụ song ngữ Nhật - Việt).
 * - 15 câu hỏi quiz (3 câu/tình huống, gồm cả trắc nghiệm multipleChoice và điền ngắn shortAnswer, có giải thích).
 * - 01 bộ chủ đề Deck N1 hợp nhất đầy đủ manifest references.
 *
 * Tất cả ID đều chuẩn 24 ký tự hex ObjectId và liên kết chéo toàn vẹn.
 */

export const n1Dataset = {
  knowledges: [
    {
      _id: '67250000000000000000a001',
      contentId: '67250000000000000000a001',
      versionId: '67250000000000000000a101',
      revision: 1,
      type: 'grammar',
      expression: '〜を余儀なくされる',
      reading: '〜をよぎなくされる',
      meaning:
        'Buộc phải..., không còn cách nào khác ngoài việc... (do hoàn cảnh khách quan ép buộc)',
      examples: [
        {
          japanese: '原材料費の高騰により、価格改定を余儀なくされました。',
          vietnamese:
            'Do chi phí nguyên vật liệu tăng vọt, chúng tôi buộc phải điều chỉnh lại giá bán.',
        },
      ],
    },
    {
      _id: '67250000000000000000a002',
      contentId: '67250000000000000000a002',
      versionId: '67250000000000000000a102',
      revision: 1,
      type: 'vocabulary',
      expression: '折衝',
      reading: 'せっしょう',
      meaning:
        'Đàm phán, thương lượng, dàn xếp (giữa các bên có xung đột lợi ích nhằm đạt thỏa thuận)',
      examples: [
        {
          japanese: '契約条件について取引先と粘り強く折衝を重ねました。',
          vietnamese:
            'Chúng tôi đã kiên trì đàm phán nhiều lần với đối tác về các điều khoản hợp đồng.',
        },
      ],
    },
    {
      _id: '67250000000000000000a003',
      contentId: '67250000000000000000a003',
      versionId: '67250000000000000000a103',
      revision: 1,
      type: 'grammar',
      expression: '〜極まりない',
      reading: '〜きわまりない',
      meaning:
        'Vô cùng, hết sức, tột cùng (thường dùng thể hiện cảm xúc mạnh, bức xúc hoặc đánh giá cao độ)',
      examples: [
        {
          japanese:
            '重要な商談の直前に連絡が滞るとは、遺憾極まりない対応です。',
          vietnamese:
            'Việc thông tin bị chậm trễ ngay trước buổi đàm phán quan trọng là một cách xử lý vô cùng đáng tiếc.',
        },
      ],
    },
    {
      _id: '67250000000000000000a004',
      contentId: '67250000000000000000a004',
      versionId: '67250000000000000000a104',
      revision: 1,
      type: 'vocabulary',
      expression: '不手際',
      reading: 'ふてぎわ',
      meaning:
        'Sơ suất, thiếu sót, sự vụng về trong xử lý công việc gây phiền toái',
      examples: [
        {
          japanese:
            '弊社の不手際により、多大なるご迷惑をおかけしましたことをお詫び申し上げます。',
          vietnamese:
            'Chúng tôi xin chân thành tạ lỗi vì sơ suất của công ty đã gây ra rất nhiều phiền toái cho quý khách.',
        },
      ],
    },
    {
      _id: '67250000000000000000a005',
      contentId: '67250000000000000000a005',
      versionId: '67250000000000000000a105',
      revision: 1,
      type: 'grammar',
      expression: '〜に至っては',
      reading: '〜にいたっては',
      meaning:
        'Đến như / Riêng trường hợp... thì (đưa ra trường hợp cụ thể, cực đoan để nhấn mạnh mức độ nghiêm trọng)',
      examples: [
        {
          japanese:
            '競合他社は次々と新技術を導入しており、A社に至っては既に世界展開を果たしています。',
          vietnamese:
            'Các đối thủ cạnh tranh liên tiếp áp dụng công nghệ mới, đến như công ty A thì thậm chí đã mở rộng ra toàn cầu.',
        },
      ],
    },
    {
      _id: '67250000000000000000a006',
      contentId: '67250000000000000000a006',
      versionId: '67250000000000000000a106',
      revision: 1,
      type: 'vocabulary',
      expression: '見通し',
      reading: 'みとおし',
      meaning: 'Triển vọng, dự phóng, tầm nhìn dự báo về tương lai kinh doanh',
      examples: [
        {
          japanese: '今年度の売上高は前年比で15パーセント増加する見通しです。',
          vietnamese:
            'Doanh thu năm tài chính này có triển vọng tăng 15% so với năm trước.',
        },
      ],
    },
    {
      _id: '67250000000000000000a007',
      contentId: '67250000000000000000a007',
      versionId: '67250000000000000000a107',
      revision: 1,
      type: 'grammar',
      expression: '〜を皮切りに',
      reading: '〜をかわきりに',
      meaning:
        'Khởi đầu bằng..., bắt đầu với... rồi liên tiếp diễn ra các hành động tương tự sau đó',
      examples: [
        {
          japanese:
            '東京本社でのパイロット導入を皮切りに、全国の支社へシステムを展開いたします。',
          vietnamese:
            'Khởi đầu bằng việc triển khai thí điểm tại trụ sở Tokyo, chúng tôi sẽ mở rộng hệ thống đến các chi nhánh toàn quốc.',
        },
      ],
    },
    {
      _id: '67250000000000000000a008',
      contentId: '67250000000000000000a008',
      versionId: '67250000000000000000a108',
      revision: 1,
      type: 'vocabulary',
      expression: '前倒し',
      reading: 'まえだおし',
      meaning: 'Đẩy sớm tiến độ, thực hiện trước thời hạn dự định',
      examples: [
        {
          japanese:
            '納期の遅れを取り戻すため、検証フェーズの工程を前倒しで進めます。',
          vietnamese:
            'Để bù đắp thời gian giao hàng bị trễ, chúng tôi sẽ đẩy sớm tiến độ giai đoạn kiểm thử.',
        },
      ],
    },
    {
      _id: '67250000000000000000a009',
      contentId: '67250000000000000000a009',
      versionId: '67250000000000000000a109',
      revision: 1,
      type: 'grammar',
      expression: '〜ならではの',
      reading: '〜ならではの',
      meaning: 'Đặc trưng riêng chỉ có ở..., chỉ có... mới đem lại được',
      examples: [
        {
          japanese:
            '長年の信頼関係がある貴社ならではの、柔軟かつ迅速なご提案に感謝いたします。',
          vietnamese:
            'Chúng tôi rất trân trọng đề xuất linh hoạt và nhanh chóng mà chỉ đối tác có quan hệ tin cậy lâu năm như quý công ty mới có được.',
        },
      ],
    },
    {
      _id: '67250000000000000000a010',
      contentId: '67250000000000000000a010',
      versionId: '67250000000000000000a110',
      revision: 1,
      type: 'vocabulary',
      expression: '円満',
      reading: 'えんまん',
      meaning:
        'Viên mãn, êm đẹp, hòa hảo, trọn vẹn (không để xảy ra tranh chấp, bất hòa)',
      examples: [
        {
          japanese:
            '双方の合意に基づき、提携契約を円満に解消することで合致いたしました。',
          vietnamese:
            'Dựa trên sự đồng thuận của cả hai bên, chúng tôi đã thống nhất chấm dứt hợp đồng liên minh một cách êm đẹp.',
        },
      ],
    },
  ],

  questions: [
    // Questions for Scenario 1
    {
      _id: '67250000000000000000b001',
      contentId: '67250000000000000000b001',
      versionId: '67250000000000000000b101',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        'Khi muốn giải thích một cách trang trọng với đối tác rằng vì hoàn cảnh bất khả kháng nên công ty buộc phải thay đổi chính sách giá, mẫu câu nào sau đây là phù hợp nhất ở trình độ N1?',
      options: [
        {
          id: 'opt_1',
          text: '諸般の事情により、価格の改定を余儀なくされました。',
        },
        {
          id: 'opt_2',
          text: '値段を上げてもいいですか。',
        },
        {
          id: 'opt_3',
          text: '原料が高いので、価格を変えたほうがいいです。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "Mẫu '〜を余儀なくされる' diễn tả tình thế bị động bất khả kháng phải làm điều gì đó. Cụm '諸般の事情により' (do nhiều hoàn cảnh khác nhau) là văn phong thương mại trang trọng.",
      knowledgeVersionIds: ['67250000000000000000a101'],
    },
    {
      _id: '67250000000000000000b002',
      contentId: '67250000000000000000b002',
      versionId: '67250000000000000000b102',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Từ nào sau đây mang ý nghĩa 'đàm phán, thương thảo dàn xếp giữa hai bên có xung đột lợi ích để đi đến thỏa thuận chung'?",
      options: [
        { id: 'opt_1', text: '折衝（せっしょう）' },
        { id: 'opt_2', text: '雑談（ざつだん）' },
        { id: 'opt_3', text: '挨拶（あいさつ）' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'折衝' (thương thảo/chiết xung) là thuật ngữ chuyên dùng cho các cuộc đàm phán chính trị hoặc kinh doanh nhằm dung hòa quyền lợi đôi bên.",
      knowledgeVersionIds: ['67250000000000000000a102'],
    },
    {
      _id: '67250000000000000000b003',
      contentId: '67250000000000000000b003',
      versionId: '67250000000000000000b103',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền trợ từ thích hợp vào chỗ trống trong mẫu câu N1: '輸送コストの高騰が、採算悪化（　）余儀なくさせた。'",
      acceptedAnswers: ['を', 'wo'],
      explanation:
        "Mẫu thể chủ động là 'Aが Bを余儀なくさせる' (A khiến cho B buộc phải xảy ra), trợ từ cần điền là 'を'.",
      knowledgeVersionIds: ['67250000000000000000a101'],
    },

    // Questions for Scenario 2
    {
      _id: '67250000000000000000b004',
      contentId: '67250000000000000000b004',
      versionId: '67250000000000000000b104',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Khi đại diện đối tác muốn bày tỏ thái độ phẫn nộ và không hài lòng tột cùng trước cách phản hồi thiếu trách nhiệm của đối phương, câu nào dùng cấu trúc '〜極まりない' chính xác?",
      options: [
        {
          id: 'opt_1',
          text: '事前の通告もないままサーバーを停止するとは、無責任極まりない措置です。',
        },
        {
          id: 'opt_2',
          text: 'サーバーが止まって、とてもうれしい極まりないです。',
        },
        {
          id: 'opt_3',
          text: '親切極まりないサービスに心から感謝します。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'無責任極まりない' (vô trách nhiệm tột cùng) là cách diễn đạt N1 thể hiện sự phê phán gay gắt đối với một hành vi công vụ cẩu thả.",
      knowledgeVersionIds: ['67250000000000000000a103'],
    },
    {
      _id: '67250000000000000000b005',
      contentId: '67250000000000000000b005',
      versionId: '67250000000000000000b105',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Trong thư tạ lỗi gửi khách hàng sau sự cố, từ nào dùng để khiêm nhường chỉ 'sơ suất, thiếu sót do kỹ năng xử lý chưa chu đáo của phía mình'?",
      options: [
        { id: 'opt_1', text: '不手際（ふてぎわ）' },
        { id: 'opt_2', text: '手柄（てがら）' },
        { id: 'opt_3', text: '手腕（しゅわん）' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'不手際' nghĩa là sự vụng về, sơ suất trong khâu tổ chức hoặc xử lý nghiệp vụ.",
      knowledgeVersionIds: ['67250000000000000000a104'],
    },
    {
      _id: '67250000000000000000b006',
      contentId: '67250000000000000000b006',
      versionId: '67250000000000000000b106',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Hoàn thành từ còn thiếu trong câu khiêm nhường tạ lỗi thương mại: '当方の不（　）により、多大なるご迷惑をおかけいたしました。'",
      acceptedAnswers: ['手際', 'てぎわ'],
      explanation: "Từ ghép hoàn chỉnh là '不手際' (ふてぎわ).",
      knowledgeVersionIds: ['67250000000000000000a104'],
    },

    // Questions for Scenario 3
    {
      _id: '67250000000000000000b007',
      contentId: '67250000000000000000b007',
      versionId: '67250000000000000000b107',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        'Trong cuộc họp chiến lược, khi muốn nêu bật một trường hợp đối thủ điển hình đã bứt phá ngoạn mục để cảnh báo nguy cơ tụt hậu của công ty, cấu trúc nào dưới đây được sử dụng phù hợp nhất?',
      options: [
        {
          id: 'opt_1',
          text: '業界の革新が進む中、先端を行くA社に至っては売上の4割を新規事業が占めています。',
        },
        {
          id: 'opt_2',
          text: 'A社に至っては、何もしないほうが安全です。',
        },
        {
          id: 'opt_3',
          text: 'A社のおかげで、全員が眠くなりました。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'〜に至っては' đưa ra một trường hợp nổi bật, tiêu biểu (ở đây là công ty A đi đầu) để so sánh và làm rõ bối cảnh chung.",
      knowledgeVersionIds: ['67250000000000000000a105'],
    },
    {
      _id: '67250000000000000000b008',
      contentId: '67250000000000000000b008',
      versionId: '67250000000000000000b108',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Cụm từ nào thường đi cùng '見通し' khi báo cáo ban giám đốc rằng 'chưa có căn cứ rõ ràng để dự báo kết quả'?",
      options: [
        { id: 'opt_1', text: '見通しが立たない' },
        { id: 'opt_2', text: '見通しを脱ぐ' },
        { id: 'opt_3', text: '見通しを飲む' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "Cụm cố định '見通しが立たない' nghĩa là không thể đưa ra dự đoán/triển vọng rõ ràng do thiếu dữ liệu hoặc tình hình bất định.",
      knowledgeVersionIds: ['67250000000000000000a106'],
    },
    {
      _id: '67250000000000000000b009',
      contentId: '67250000000000000000b009',
      versionId: '67250000000000000000b109',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền từ còn thiếu vào thành ngữ thương mại: '今後の収益（　　　）について慎重に精査する必要があります。' (từ mang nghĩa triển vọng/dự báo tương lai)",
      acceptedAnswers: ['見通し', 'みとおし'],
      explanation:
        "Từ cần điền là '見通し' (triển vọng / dự phóng kinh doanh).",
      knowledgeVersionIds: ['67250000000000000000a106'],
    },

    // Questions for Scenario 4
    {
      _id: '67250000000000000000b010',
      contentId: '67250000000000000000b010',
      versionId: '67250000000000000000b110',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Khi trình bày kế hoạch bàn giao theo từng phần để khách hàng yên tâm về tiến độ tổng thể, câu nào sử dụng đúng ngữ pháp '〜を皮切りに'?",
      options: [
        {
          id: 'opt_1',
          text: '来週の認証機能リリースを皮切りに、残るモジュールを順次納品してまいります。',
        },
        {
          id: 'opt_2',
          text: 'すべての作業を皮切りに、今日でプロジェクトは終了します。',
        },
        {
          id: 'opt_3',
          text: '納期の遅延を皮切りに、何も納品できなくなりました。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'〜を皮切りに' thể hiện việc một hành động diễn ra mở đầu cho một chuỗi các hoạt động liên tiếp cùng loại (ở đây là bàn giao từng đợt).",
      knowledgeVersionIds: ['67250000000000000000a107'],
    },
    {
      _id: '67250000000000000000b011',
      contentId: '67250000000000000000b011',
      versionId: '67250000000000000000b111',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Từ nào mang nghĩa 'đẩy sớm lịch trình hoặc tiến độ của một công việc so với kế hoạch ban đầu'?",
      options: [
        { id: 'opt_1', text: '前倒し（まえだおし）' },
        { id: 'opt_2', text: '先送り（さきおくり）' },
        { id: 'opt_3', text: '後回し（あとまわし）' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'前倒し' là đẩy sớm tiến độ. Ngược lại, '先送り' và '後回し' là hoãn lại, dời về sau.",
      knowledgeVersionIds: ['67250000000000000000a108'],
    },
    {
      _id: '67250000000000000000b012',
      contentId: '67250000000000000000b012',
      versionId: '67250000000000000000b112',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Nhập từ đối nghĩa với '先送り' trong quản lý tiến độ dự án (nghĩa là đẩy sớm tiến độ):",
      acceptedAnswers: ['前倒し', 'まえだおし'],
      explanation:
        "'前倒し' (まえだおし) có nghĩa là đẩy sớm tiến độ trước kế hoạch.",
      knowledgeVersionIds: ['67250000000000000000a108'],
    },

    // Questions for Scenario 5
    {
      _id: '67250000000000000000b013',
      contentId: '67250000000000000000b013',
      versionId: '67250000000000000000b113',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Trong thư kết thúc đàm phán hợp tác, khi muốn khen ngợi sự linh hoạt và hỗ trợ tận tâm mà 'chỉ có đối tác lâu năm như quý công ty mới làm được', câu nào diễn đạt chuẩn N1?",
      options: [
        {
          id: 'opt_1',
          text: '長年の実績を誇る貴社ならではの温かいご配慮に、深く敬意を表します。',
        },
        {
          id: 'opt_2',
          text: '貴社ならでは、契約を切るしかありません。',
        },
        {
          id: 'opt_3',
          text: '貴社ならではのせいで、大損害が出ました。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "Cấu trúc 'N + ならではの' thường mang sắc thái tích cực cao độ, ca ngợi giá trị hoặc thế mạnh độc đáo duy nhất của đối tượng.",
      knowledgeVersionIds: ['67250000000000000000a109'],
    },
    {
      _id: '67250000000000000000b014',
      contentId: '67250000000000000000b014',
      versionId: '67250000000000000000b114',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Cụm từ nào mang nghĩa 'tháo gỡ bất đồng và giải quyết vấn đề một cách êm đẹp, hòa hảo đôi bên cùng hài lòng'?",
      options: [
        { id: 'opt_1', text: '円満に解決する' },
        { id: 'opt_2', text: '強引に打ち切る' },
        { id: 'opt_3', text: '曖昧に放置する' },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'円満に解決する' là cụm từ chuẩn mực trong thương lượng đối tác để chỉ kết quả hòa hợp không gây thù oán.",
      knowledgeVersionIds: ['67250000000000000000a110'],
    },
    {
      _id: '67250000000000000000b015',
      contentId: '67250000000000000000b015',
      versionId: '67250000000000000000b115',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền từ còn thiếu vào chỗ trống: '双方が納得し、（　　）な関係を維持したまま契約を更新いたしました。' (từ mang nghĩa êm đẹp, trọn vẹn)",
      acceptedAnswers: ['円満', 'えんまん'],
      explanation: "Từ cần điền là '円満' (えんまん).",
      knowledgeVersionIds: ['67250000000000000000a110'],
    },
  ],

  scenarios: [
    {
      _id: '67250000000000000000c001',
      contentId: '67250000000000000000c001',
      versionId: '67250000000000000000c101',
      revision: 1,
      title: 'Đàm phán tăng giá và điều khoản hợp đồng',
      context:
        'Do chi phí nguyên vật liệu và vận chuyển quốc tế biến động mạnh, công ty cung ứng cần đề xuất tăng giá 10% cho đợt giao hàng tiếp theo với đối tác chiến lược lâu năm.',
      objective:
        'Giải thích thuyết phục lý do khách quan không thể tránh khỏi, nhượng bộ về thời hạn thanh toán hoặc chiết khấu số lượng lớn để đạt được thỏa thuận ký kết phụ lục hợp đồng.',
      roleA:
        'Trưởng phòng kinh doanh nhà cung ứng: Bày tỏ sự thấu hiểu khó khăn của đối tác, dẫn chứng dữ liệu thị trường và lịch sự đề xuất mức giá mới cùng phương án hỗ trợ giãn dòng tiền.',
      roleB:
        'Trưởng phòng thu mua đối tác: Ban đầu bày tỏ sự quan ngại sâu sắc về biên lợi nhuận, chất vấn lộ trình áp dụng và nỗ lực thương lượng để giảm thiểu tác động tài chính cho công ty mình.',
      hints: [
        '諸般の事情により、価格改定を余儀なくされました (Do nhiều hoàn cảnh khách quan, chúng tôi buộc phải điều chỉnh giá)',
        '何卒ご容赦のほどお願い申し上げます (Kính mong quý đối tác lượng thứ và thông cảm)',
        '双方が納得できる着地点を見出すべく、善処いたします (Chúng tôi sẽ nỗ lực tìm kiếm điểm cân bằng đôi bên cùng chấp nhận được)',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a101',
        '67250000000000000000a102',
      ],
      questionVersionIds: [
        '67250000000000000000b101',
        '67250000000000000000b102',
        '67250000000000000000b103',
      ],
    },
    {
      _id: '67250000000000000000c002',
      contentId: '67250000000000000000c002',
      versionId: '67250000000000000000c102',
      revision: 1,
      title: 'Xử lý sự cố gián đoạn dịch vụ và khiếu nại của khách hàng',
      context:
        'Hệ thống hạ tầng đám mây của nhà cung cấp gặp trục trặc kỹ thuật bất ngờ trong đợt cao điểm mua sắm, làm tê liệt cổng thanh toán của khách hàng doanh nghiệp trong hai giờ.',
      objective:
        'Chân thành tạ lỗi về sơ suất kỹ thuật, giải trình rõ ràng nguyên nhân gốc rễ, trình bày giải pháp ngăn ngừa tái phát và cam kết phương án bồi hoàn thiệt hại theo thỏa thuận SLA.',
      roleA:
        'Giám đốc dịch vụ khách hàng: Dùng kính ngữ chuẩn mực để tạ lỗi, nhận hoàn toàn trách nhiệm và chủ động đưa ra báo cáo sự cố kèm chính sách đền bù thỏa đáng.',
      roleB:
        'Giám đốc vận hành phía khách hàng: Thể hiện sự không hài lòng gay gắt về tổn thất doanh thu, truy vấn trách nhiệm giám sát và yêu cầu cam kết cụ thể về tiến độ khắc phục.',
      hints: [
        '弊社の不手際により、多大なるご迷惑をおかけしました (Do sơ suất của công ty chúng tôi đã gây ra phiền toái to lớn)',
        '事態を重く受け止め、遺憾の意を表します (Chúng tôi nhìn nhận sự việc hết sức nghiêm túc và bày tỏ sự lấy làm tiếc sâu sắc)',
        '再発防止策を講じる所存でございます (Chúng tôi cam kết sẽ triển khai triệt để các biện pháp ngăn ngừa tái phát)',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a103',
        '67250000000000000000a104',
      ],
      questionVersionIds: [
        '67250000000000000000b104',
        '67250000000000000000b105',
        '67250000000000000000b106',
      ],
    },
    {
      _id: '67250000000000000000c003',
      contentId: '67250000000000000000c003',
      versionId: '67250000000000000000c103',
      revision: 1,
      title: 'Tranh biện định hướng chiến lược trong cuộc họp ban điều hành',
      context:
        'Ban điều hành họp khẩn để thống nhất việc phân bổ ngân sách: đẩy mạnh nghiên cứu phát triển công nghệ trí tuệ nhân tạo mới hay ưu tiên củng cố dòng tiền an toàn trước suy thoái.',
      objective:
        'Trình bày lập luận sắc bén, tôn trọng quan điểm đối lập nhưng kiên định bảo vệ luận điểm của bộ phận mình, hướng tới giải pháp cân bằng vì lợi ích dài hạn của tập đoàn.',
      roleA:
        'Giám đốc công nghệ: Thuyết phục đầu tư táo bạo vào công nghệ đột phá, chỉ rõ nguy cơ tụt hậu nếu chần chừ và đề xuất phương án thử nghiệm theo từng giai đoạn.',
      roleB:
        'Giám đốc tài chính: Phân tích áp lực thanh khoản ngắn hạn, cảnh báo rủi ro biến động thị trường và yêu cầu thiết lập các chỉ số KPI kiểm soát rủi ro nghiêm ngặt.',
      hints: [
        '競合A社に至っては、既に市場シェアの過半を獲得しております (Đến như đối thủ A thì thậm chí đã chiếm hơn nửa thị phần)',
        '株主への説明責任を果たす手前、無謀な投資は容認できません (Chính vì phải chịu trách nhiệm giải trình trước cổ đông, ta không thể chấp nhận đầu tư liều lĩnh)',
        '中長期的な収益見通しを慎重に見極める必要があります (Cần đánh giá thấu đáo triển vọng doanh thu trung và dài hạn)',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a105',
        '67250000000000000000a106',
      ],
      questionVersionIds: [
        '67250000000000000000b107',
        '67250000000000000000b108',
        '67250000000000000000b109',
      ],
    },
    {
      _id: '67250000000000000000c004',
      contentId: '67250000000000000000c004',
      versionId: '67250000000000000000c104',
      revision: 1,
      title: 'Giải trình chậm tiến độ dự án và thỏa thuận gia hạn nghiệm thu',
      context:
        'Do bên thứ ba chậm bàn giao API tích hợp bảo mật, dự án phát triển ứng dụng di động đứng trước nguy cơ trễ hạn bàn giao hai tuần so với hợp đồng cam kết ban đầu.',
      objective:
        'Giải thích nguyên nhân một cách minh bạch và chuyên nghiệp, đề xuất bàn giao các tính năng cốt lõi trước để đối tác chạy thử, đồng thời ký phụ lục gia hạn nghiệm thu trọn gói.',
      roleA:
        'Quản lý dự án phát triển: Báo cáo trung thực tiến độ hiện tại, làm rõ nguyên nhân khách quan và đưa ra kế hoạch huy động chuyên gia tăng ca để rút ngắn độ trễ.',
      roleB:
        'Quản lý dự án bên khách hàng: Ban đầu lo lắng về việc ảnh hưởng kế hoạch ra mắt thị trường, yêu cầu cam kết văn bản và đồng ý phương án bàn giao theo từng giai đoạn.',
      hints: [
        '基幹機能のリリースを皮切りに、順次納品を進めます (Khởi đầu bằng việc release các chức năng cốt lõi, chúng tôi sẽ tiến hành bàn giao từng phần)',
        '後続のテスト工程を前倒しで進めることで、遅れを取り戻します (Bằng cách đẩy sớm khâu kiểm thử phía sau, chúng tôi sẽ bù đắp phần chậm trễ)',
        '何卒ご賢察のほど、よろしくお願い申し上げます (Kính mong quý đối tác thấu hiểu và suy xét thấu đáo cho chúng tôi)',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a107',
        '67250000000000000000a108',
      ],
      questionVersionIds: [
        '67250000000000000000b110',
        '67250000000000000000b111',
        '67250000000000000000b112',
      ],
    },
    {
      _id: '67250000000000000000c005',
      contentId: '67250000000000000000c005',
      versionId: '67250000000000000000c105',
      revision: 1,
      title: 'Tái cơ cấu thỏa thuận liên minh và duy trì quan hệ đối tác',
      context:
        'Hai doanh nghiệp đối tác lâu năm cần điều chỉnh lại phạm vi liên kết kinh doanh do thay đổi định hướng ngành, chuyển từ hợp tác phân phối độc quyền sang đối tác đại lý thông thường.',
      objective:
        'Trao đổi khéo léo để thu hẹp phạm vi độc quyền mà không làm rạn nứt mối quan hệ cá nhân và sự tin cậy lâu năm, hướng tới ký kết khuôn khổ hợp tác mới đôi bên cùng có lợi.',
      roleA:
        'Giám đốc phát triển kinh doanh: Khéo léo truyền đạt chủ trương tái cơ cấu của tập đoàn, nhấn mạnh sự trân trọng mối gắn kết và đề xuất cơ chế ưu đãi riêng cho đối tác.',
      roleB:
        'Giám đốc đại diện đối tác: Tiếp nhận thông tin với thái độ bình tĩnh, chuyên nghiệp, bảo vệ các quyền lợi hiện hữu và đàm phán mức chiết khấu duy trì.',
      hints: [
        '長年の絆を持つ貴社ならではの、柔軟なご対応に心より御礼申し上げます (Chúng tôi xin gửi lời cảm ơn sâu sắc vì sự hỗ trợ linh hoạt mà chỉ đối tác có mối quan hệ gắn bó lâu năm như quý công ty mới có được)',
        '円満な形で新たなパートナーシップへ移行できるよう、全力を尽くします (Chúng tôi sẽ nỗ lực hết mình để chuyển dịch sang mối quan hệ đối tác mới một cách êm đẹp nhất)',
        'これまでのご厚情に深く感謝いたします (Chúng tôi xin cảm ơn sâu sắc mối ân tình hợp tác suốt thời gian qua)',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a109',
        '67250000000000000000a110',
      ],
      questionVersionIds: [
        '67250000000000000000b113',
        '67250000000000000000b114',
        '67250000000000000000b115',
      ],
    },
  ],

  decks: [
    {
      _id: '672500000000000000001001',
      contentId: '672500000000000000001001',
      versionId: '67250000000000000000d101',
      revision: 1,
      title: 'Thương thảo & Quản trị Doanh nghiệp',
      topicKey: 'business_negotiation_n1',
      level: 'N1',
      description:
        'Luyện hội thoại đàm phán hợp đồng, xử lý khủng hoảng sự cố, tranh biện chiến lược điều hành và thỏa thuận hợp tác thương mại cao cấp.',
      scenarioVersionIds: [
        '67250000000000000000c101',
        '67250000000000000000c102',
        '67250000000000000000c103',
        '67250000000000000000c104',
        '67250000000000000000c105',
      ],
      knowledgeVersionIds: [
        '67250000000000000000a101',
        '67250000000000000000a102',
        '67250000000000000000a103',
        '67250000000000000000a104',
        '67250000000000000000a105',
        '67250000000000000000a106',
        '67250000000000000000a107',
        '67250000000000000000a108',
        '67250000000000000000a109',
        '67250000000000000000a110',
      ],
      questionVersionIds: [
        '67250000000000000000b101',
        '67250000000000000000b102',
        '67250000000000000000b103',
        '67250000000000000000b104',
        '67250000000000000000b105',
        '67250000000000000000b106',
        '67250000000000000000b107',
        '67250000000000000000b108',
        '67250000000000000000b109',
        '67250000000000000000b110',
        '67250000000000000000b111',
        '67250000000000000000b112',
        '67250000000000000000b113',
        '67250000000000000000b114',
        '67250000000000000000b115',
      ],
    },
  ],
};
