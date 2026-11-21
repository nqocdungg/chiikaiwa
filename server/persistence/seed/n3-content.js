/**
 * Dữ liệu seed học liệu cấp độ N3 (DATA-003, PB-31).
 *
 * Tuân thủ Database Design §7.1 & §7.2 và checklist PB-31:
 * - 05 tình huống giao tiếp N3 (Công sở và đời sống hằng ngày).
 * - 10 mục kiến thức N3 (05 ngữ pháp và 05 từ vựng, đủ cách đọc, nghĩa và ví dụ Nhật - Việt).
 * - 15 câu hỏi quiz (03 câu/tình huống, kết hợp multipleChoice và shortAnswer, có giải thích).
 * - 01 bộ chủ đề Deck N3 hợp nhất đầy đủ manifest references.
 *
 * Lưu ý trạng thái: Bản nháp chờ Yến Nhi review tiếng Nhật trước khi xuất bản.
 */

export const n3Dataset = {
  knowledges: [
    {
      _id: '67230000000000000000a001',
      contentId: '67230000000000000000a001',
      versionId: '67230000000000000000a101',
      revision: 1,
      type: 'grammar',
      expression: '〜ようにしている',
      reading: '〜ようにしている',
      meaning:
        'Cố gắng duy trì thói quen hoặc nỗ lực làm việc gì đó một cách đều đặn, có ý thức',
      examples: [
        {
          japanese: '会議の前には、必ず資料を二度見直すようにしています。',
          vietnamese:
            'Trước cuộc họp, tôi luôn cố gắng kiểm tra lại tài liệu hai lần.',
        },
      ],
    },
    {
      _id: '67230000000000000000a002',
      contentId: '67230000000000000000a002',
      versionId: '67230000000000000000a102',
      revision: 1,
      type: 'vocabulary',
      expression: '確認',
      reading: 'かくにん',
      meaning: 'Sự xác nhận, kiểm tra lại cho chắc chắn',
      examples: [
        {
          japanese: '送信する前に、宛先と添付ファイルを確認してください。',
          vietnamese:
            'Trước khi gửi, hãy kiểm tra lại địa chỉ người nhận và tệp đính kèm.',
        },
      ],
    },
    {
      _id: '67230000000000000000a003',
      contentId: '67230000000000000000a003',
      versionId: '67230000000000000000a103',
      revision: 1,
      type: 'grammar',
      expression: '〜てしまう',
      reading: '〜てしまう',
      meaning:
        'Lỡ làm gì đó (tiếc nuối, ngoài ý muốn) hoặc hoàn thành dứt điểm một việc gì đó',
      examples: [
        {
          japanese: '急な出張が入ってしまい、予約の日時に行けなくなりました。',
          vietnamese:
            'Vì đột xuất có lịch công tác nên tôi không thể đến vào ngày giờ đã hẹn.',
        },
      ],
    },
    {
      _id: '67230000000000000000a004',
      contentId: '67230000000000000000a004',
      versionId: '67230000000000000000a104',
      revision: 1,
      type: 'vocabulary',
      expression: '都合',
      reading: 'つごう',
      meaning:
        'Sự thuận tiện, tình hình thời gian/hoàn cảnh (thường dùng khi hẹn gặp hoặc điều chỉnh lịch)',
      examples: [
        {
          japanese: '来週の木曜日でしたら、午後から都合がいいです。',
          vietnamese:
            'Nếu là thứ Năm tuần sau thì từ buổi chiều tôi thuận tiện.',
        },
      ],
    },
    {
      _id: '67230000000000000000a005',
      contentId: '67230000000000000000a005',
      versionId: '67230000000000000000a105',
      revision: 1,
      type: 'grammar',
      expression: '〜てある',
      reading: '〜てある',
      meaning:
        'Đã được làm sẵn và hiện vẫn giữ nguyên trạng thái đó (kết quả của hành động có chủ đích)',
      examples: [
        {
          japanese: '箱の中に、返品用の伝票がすでに入れてあります。',
          vietnamese: 'Trong hộp đã có đặt sẵn phiếu gửi trả hàng rồi.',
        },
      ],
    },
    {
      _id: '67230000000000000000a006',
      contentId: '67230000000000000000a006',
      versionId: '67230000000000000000a106',
      revision: 1,
      type: 'vocabulary',
      expression: '交換',
      reading: 'こうかん',
      meaning: 'Sự trao đổi, đổi (sản phẩm, thông tin, danh thiếp)',
      examples: [
        {
          japanese: '初期不良のため、新しい商品と交換してもらいました。',
          vietnamese:
            'Do lỗi ban đầu của sản phẩm nên tôi đã được đổi sang chiếc mới.',
        },
      ],
    },
    {
      _id: '67230000000000000000a007',
      contentId: '67230000000000000000a007',
      versionId: '67230000000000000000a107',
      revision: 1,
      type: 'grammar',
      expression: '〜ことにする',
      reading: '〜ことにする',
      meaning:
        'Quyết định làm (hoặc không làm) việc gì đó theo ý chí của bản thân hoặc nhóm',
      examples: [
        {
          japanese:
            '時間がかかりそうなので、今回は美術館には行かないことにしました。',
          vietnamese:
            'Vì có vẻ sẽ mất nhiều thời gian nên lần này chúng tôi quyết định không đi bảo tàng mỹ thuật.',
        },
      ],
    },
    {
      _id: '67230000000000000000a008',
      contentId: '67230000000000000000a008',
      versionId: '67230000000000000000a108',
      revision: 1,
      type: 'vocabulary',
      expression: '予定',
      reading: 'よてい',
      meaning: 'Dự định, kế hoạch, lịch trình',
      examples: [
        {
          japanese: '連休の予定はもう決まりましたか。',
          vietnamese: 'Kế hoạch cho kỳ nghỉ dài đã quyết định xong chưa?',
        },
      ],
    },
    {
      _id: '67230000000000000000a009',
      contentId: '67230000000000000000a009',
      versionId: '67230000000000000000a109',
      revision: 1,
      type: 'grammar',
      expression: '〜場合',
      reading: '〜ばあい',
      meaning: 'Trong trường hợp..., nếu xảy ra tình huống...',
      examples: [
        {
          japanese: '急ぎの連絡がある場合は、携帯電話のほうへおかけください。',
          vietnamese:
            'Trong trường hợp có liên lạc gấp, xin hãy gọi vào số điện thoại di động.',
        },
      ],
    },
    {
      _id: '67230000000000000000a010',
      contentId: '67230000000000000000a010',
      versionId: '67230000000000000000a110',
      revision: 1,
      type: 'vocabulary',
      expression: '連絡',
      reading: 'れんらく',
      meaning: 'Liên lạc, thông báo',
      examples: [
        {
          japanese: '病院に行ったあと、もう一度会社に連絡します。',
          vietnamese:
            'Sau khi đi khám bệnh, tôi sẽ liên lạc lại với công ty một lần nữa.',
        },
      ],
    },
  ],

  questions: [
    // Questions for Scenario 1
    {
      _id: '67230000000000000000b001',
      contentId: '67230000000000000000b001',
      versionId: '67230000000000000000b101',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Khi muốn nói với đồng nghiệp rằng mình luôn cố gắng kiểm tra kỹ lỗi trước khi nộp tài liệu, câu nào dùng cấu trúc N3 '〜ようにしている' tự nhiên và chính xác nhất?",
      options: [
        {
          id: 'opt_1',
          text: '提出する前に、誤字がないか必ずチェックするようにしています。',
        },
        {
          id: 'opt_2',
          text: '提出する前に、誤字がないかチェックしてしまいます。',
        },
        {
          id: 'opt_3',
          text: '提出する前に、誤字がないかチェックしたばかりです。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'〜ようにしている' diễn tả sự cố gắng duy trì một thói quen hoặc hành động có chủ đích. '〜てしまう' mang nghĩa lỡ làm hoặc hoàn thành, còn '〜たばかり' nghĩa là vừa mới làm xong.",
      knowledgeVersionIds: ['67230000000000000000a101'],
    },
    {
      _id: '67230000000000000000b002',
      contentId: '67230000000000000000b002',
      versionId: '67230000000000000000b102',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Từ vựng nào phù hợp nhất để điền vào chỗ trống trong câu: '数値に間違いがないか、もう一度（　）していただけますか。'?",
      options: [
        { id: 'opt_1', text: '期待（きたい）' },
        { id: 'opt_2', text: '確認（かくにん）' },
        { id: 'opt_3', text: '発見（はっけん）' },
      ],
      correctOptionId: 'opt_2',
      explanation:
        "'確認（かくにん）' nghĩa là xác nhận, kiểm tra lại. '期待' là kỳ vọng, '発見' là phát hiện.",
      knowledgeVersionIds: ['67230000000000000000a102'],
    },
    {
      _id: '67230000000000000000b003',
      contentId: '67230000000000000000b003',
      versionId: '67230000000000000000b103',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền dạng thích hợp của động từ '忘れる' (quên) vào chỗ trống để diễn tả 'cố gắng không quên': '締め切りを（　）ようにしています。'",
      acceptedAnswers: ['忘れない', 'わすれない'],
      explanation:
        "Cấu trúc 'cố gắng không làm gì' dùng thể phủ định ngắn V-ない + ようにしている, nên '忘れる' chuyển thành '忘れない'.",
      knowledgeVersionIds: ['67230000000000000000a101'],
    },

    // Questions for Scenario 2
    {
      _id: '67230000000000000000b004',
      contentId: '67230000000000000000b004',
      versionId: '67230000000000000000b104',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        'Khi gọi điện xin lỗi phòng khám vì có việc đột xuất khiến bạn không thể giữ hẹn, câu nào thể hiện sắc thái tiếc nuối tự nhiên nhất ở trình độ N3?',
      options: [
        {
          id: 'opt_1',
          text: '急用ができておいて、土曜日に伺えなくなりました。',
        },
        {
          id: 'opt_2',
          text: '急用ができてみて、土曜日に伺えなくなりました。',
        },
        {
          id: 'opt_3',
          text: '急用ができてしまい、土曜日に伺えなくなりました。',
        },
      ],
      correctOptionId: 'opt_3',
      explanation:
        "'〜てしまう' (ở đây dùng dạng liên dụng '〜てしまい' để nối câu trang trọng; thể て tương ứng là '〜てしまって') diễn tả sự việc xảy ra ngoài ý muốn kèm cảm giác tiếc nuối hoặc áy náy khi xin lỗi. '〜ておいて' (thể て của '〜ておく') mang nghĩa làm sẵn có chủ đích, còn '〜てみて' (thể て của '〜てみる') mang nghĩa thử làm xem sao, đều không phù hợp với việc đột xuất ngoài ý muốn.",
      knowledgeVersionIds: ['67230000000000000000a103'],
    },
    {
      _id: '67230000000000000000b005',
      contentId: '67230000000000000000b005',
      versionId: '67230000000000000000b105',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Trong hội thoại sắp xếp lịch hẹn, cụm từ 'ご都合はいかがでしょうか' có nghĩa là gì?",
      options: [
        { id: 'opt_1', text: 'Sức khỏe của anh/chị dạo này thế nào ạ?' },
        {
          id: 'opt_2',
          text: 'Lịch trình / thời gian của anh/chị có thuận tiện không ạ?',
        },
        { id: 'opt_3', text: 'Địa chỉ nhà của anh/chị ở đâu ạ?' },
      ],
      correctOptionId: 'opt_2',
      explanation:
        "'ご都合（つごう）' là cách nói lịch sự hỏi về sự thuận tiện về mặt thời gian hoặc hoàn cảnh của đối phương.",
      knowledgeVersionIds: ['67230000000000000000a104'],
    },
    {
      _id: '67230000000000000000b006',
      contentId: '67230000000000000000b006',
      versionId: '67230000000000000000b106',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Viết cách đọc hiragana của từ '都合' (sự thuận tiện, lịch trình):",
      acceptedAnswers: ['つごう'],
      explanation: "'都合' đọc là 'つごう'.",
      knowledgeVersionIds: ['67230000000000000000a104'],
    },

    // Questions for Scenario 3
    {
      _id: '67230000000000000000b007',
      contentId: '67230000000000000000b007',
      versionId: '67230000000000000000b107',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Nhân viên CSKH muốn nói rằng 'Trong hộp đã được bỏ sẵn phiếu đổi trả rồi', câu nào sử dụng đúng mẫu ngữ pháp N3?",
      options: [
        {
          id: 'opt_1',
          text: '箱の中に返送用の伝票が同封してあります。',
        },
        {
          id: 'opt_2',
          text: '箱の中に返送用の伝票が同封してしまいます。',
        },
        {
          id: 'opt_3',
          text: '箱の中に返送用の伝票が同封しそうです。',
        },
      ],
      correctOptionId: 'opt_1',
      explanation:
        "'Tha động từ + てある' diễn tả trạng thái hiện tại là kết quả của một hành động chuẩn bị trước có chủ đích (đã được bỏ sẵn vào trong hộp).",
      knowledgeVersionIds: ['67230000000000000000a105'],
    },
    {
      _id: '67230000000000000000b008',
      contentId: '67230000000000000000b008',
      versionId: '67230000000000000000b108',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        'Khi muốn yêu cầu đổi sản phẩm bị lỗi lấy sản phẩm mới, từ nào sau đây phù hợp nhất?',
      options: [
        { id: 'opt_1', text: '紹介（しょうかい）' },
        { id: 'opt_2', text: '説明（せつめい）' },
        { id: 'opt_3', text: '交換（こうかん）' },
      ],
      correctOptionId: 'opt_3',
      explanation:
        "'交換（こうかん）' là đổi (đổi hàng, đổi chỗ). '紹介' là giới thiệu, '説明' là giải thích.",
      knowledgeVersionIds: ['67230000000000000000a106'],
    },
    {
      _id: '67230000000000000000b009',
      contentId: '67230000000000000000b009',
      versionId: '67230000000000000000b109',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Điền từ thích hợp (bằng kanji hoặc hiragana) vào chỗ trống: '壊れた商品を新しいものと（　）したいのですが。' (Tôi muốn đổi sản phẩm bị hỏng lấy cái mới).",
      acceptedAnswers: ['交換', 'こうかん'],
      explanation: "Cụm 'Aと交換する' nghĩa là đổi lấy A.",
      knowledgeVersionIds: ['67230000000000000000a106'],
    },

    // Questions for Scenario 4
    {
      _id: '67230000000000000000b010',
      contentId: '67230000000000000000b010',
      versionId: '67230000000000000000b110',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        'Khi cả nhóm đã bàn bạc và quyết định sẽ ăn trưa gần nhà ga trước khi lên núi, câu nào diễn đạt đúng quyết định đó?',
      options: [
        {
          id: 'opt_1',
          text: '駅の近くで昼ご飯を食べてから行くはずでした。',
        },
        {
          id: 'opt_2',
          text: '駅の近くで昼ご飯を食べてから行くことにしました。',
        },
        {
          id: 'opt_3',
          text: '駅の近くで昼ご飯を食べてから行くところでした。',
        },
      ],
      correctOptionId: 'opt_2',
      explanation:
        "'〜ことにする' thể hiện quyết định chủ động của người nói hoặc nhóm sau khi cân nhắc/bàn bạc. '〜はずでした' diễn tả dự đoán trong quá khứ nhưng thực tế không như vậy ('lẽ ra đã...'), còn '〜ところでした' diễn tả sự việc suýt nữa thì xảy ra hoặc vừa đúng lúc sắp làm.",
      knowledgeVersionIds: ['67230000000000000000a107'],
    },
    {
      _id: '67230000000000000000b011',
      contentId: '67230000000000000000b011',
      versionId: '67230000000000000000b111',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Trong câu '雨が降ったら、予定を変更しましょう', từ '予定' có nghĩa là gì?",
      options: [
        { id: 'opt_1', text: 'Kế hoạch, lịch trình dự kiến' },
        { id: 'opt_2', text: 'Chi phí dự kiến' },
        { id: 'opt_3', text: 'Hành lý mang theo' },
      ],
      correctOptionId: 'opt_1',
      explanation: "'予定（よてい）' nghĩa là kế hoạch, dự định, lịch trình.",
      knowledgeVersionIds: ['67230000000000000000a108'],
    },
    {
      _id: '67230000000000000000b012',
      contentId: '67230000000000000000b012',
      versionId: '67230000000000000000b112',
      revision: 1,
      type: 'shortAnswer',
      prompt:
        "Hoàn thành câu sau bằng cấu trúc N3 'quyết định không làm gì': '疲れているので、今日は出かけ（　）ことにしました。'",
      acceptedAnswers: ['ない'],
      explanation:
        "Cấu trúc 'quyết định không làm gì' là V-ない + ことにする. Động từ '出かける' chia thể ない là '出かけない', nên phần cần điền là 'ない'.",
      knowledgeVersionIds: ['67230000000000000000a107'],
    },

    // Questions for Scenario 5
    {
      _id: '67230000000000000000b013',
      contentId: '67230000000000000000b013',
      versionId: '67230000000000000000b113',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Câu nào dùng cấu trúc N3 '〜場合' đúng để dặn dò: 'Trong trường hợp không liên lạc được qua email, hãy gọi điện thoại'?",
      options: [
        {
          id: 'opt_1',
          text: 'メールで連絡が取れないおかげで、電話をしてください。',
        },
        {
          id: 'opt_2',
          text: 'メールで連絡が取れないせいで、電話をしてください。',
        },
        {
          id: 'opt_3',
          text: 'メールで連絡が取れない場合は、電話をしてください。',
        },
      ],
      correctOptionId: 'opt_3',
      explanation:
        "'〜場合は' dùng để giả định một tình huống có thể xảy ra ('trong trường hợp...'). '〜おかげで' là nhờ vào, '〜せいで' là tại vì.",
      knowledgeVersionIds: ['67230000000000000000a109'],
    },
    {
      _id: '67230000000000000000b014',
      contentId: '67230000000000000000b014',
      versionId: '67230000000000000000b114',
      revision: 1,
      type: 'multipleChoice',
      prompt:
        "Khi muốn nói 'Tôi xin lỗi vì đã liên lạc gấp vào buổi sáng', từ nào điền vào chỗ trống là tự nhiên nhất: '朝早くに急な（　）をしてしまい、申し訳ありません。'?",
      options: [
        { id: 'opt_1', text: '練習（れんしゅう）' },
        { id: 'opt_2', text: '連絡（れんらく）' },
        { id: 'opt_3', text: '連続（れんぞく）' },
      ],
      correctOptionId: 'opt_2',
      explanation:
        "'連絡（れんらく）' là liên lạc, thông báo. '練習' là luyện tập, '連続' là liên tục.",
      knowledgeVersionIds: ['67230000000000000000a110'],
    },
    {
      _id: '67230000000000000000b015',
      contentId: '67230000000000000000b015',
      versionId: '67230000000000000000b115',
      revision: 1,
      type: 'shortAnswer',
      prompt: "Viết cách đọc hiragana của từ '連絡' (liên lạc):",
      acceptedAnswers: ['れんらく'],
      explanation: "'連絡' đọc là 'れんらく'.",
      knowledgeVersionIds: ['67230000000000000000a110'],
    },
  ],

  scenarios: [
    {
      _id: '67230000000000000000c001',
      contentId: '67230000000000000000c001',
      versionId: '67230000000000000000c101',
      revision: 1,
      title: 'Nhờ đồng nghiệp hỗ trợ kiểm tra tài liệu trước giờ họp',
      context:
        'Cuộc họp với khách hàng sẽ diễn ra vào lúc 14 giờ chiều nay. Bạn vừa hoàn thành bản đề xuất nhưng lo ngại còn lỗi diễn đạt tiếng Nhật nên muốn nhờ đồng nghiệp người Nhật xem qua giúp trong 15 phút.',
      objective:
        'Trình bày rõ lý do cần nhờ gấp, thời hạn mong muốn và lắng nghe phản hồi, điều kiện hỗ trợ của đồng nghiệp một cách lịch sự.',
      roleA:
        'Nhân viên chuẩn bị tài liệu: Mở lời xin phép làm phiền, giải thích ngắn gọn nội dung cần kiểm tra và hỏi xem đồng nghiệp có thể hỗ trợ trước 13 giờ 30 hay không.',
      roleB:
        'Đồng nghiệp (Senpai): Đang bận xử lý việc riêng nhưng sẵn sàng hỗ trợ nếu chỉ xem phần tóm tắt chính, đồng thời gợi ý cách chỉnh sửa câu văn tự nhiên hơn.',
      hints: [
        'お忙しいところ申し訳ありませんが、資料をご確認いただけないでしょうか (Xin lỗi đã làm phiền lúc anh/chị đang bận, anh/chị có thể xem giúp em tài liệu được không ạ?)',
        '大切な会議の前には、いつも事前にチェックしてもらうようにしています (Trước những cuộc họp quan trọng, em luôn cố gắng nhờ kiểm tra trước ạ)',
        '13時半までにお返事をいただけますと助かります (Nếu anh/chị có thể phản hồi giúp em trước 13 giờ 30 thì tốt quá ạ)',
        '全体を見る時間はないので、結論の部分だけ確認しましょうか (Vì không có thời gian xem toàn bộ, mình kiểm tra phần kết luận thôi nhé?)',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a101',
        '67230000000000000000a102',
      ],
      questionVersionIds: [
        '67230000000000000000b101',
        '67230000000000000000b102',
        '67230000000000000000b103',
      ],
    },
    {
      _id: '67230000000000000000c002',
      contentId: '67230000000000000000c002',
      versionId: '67230000000000000000c102',
      revision: 1,
      title: 'Gọi điện xin đổi lịch hẹn khám nha khoa',
      context:
        'Bạn đã đặt lịch khám răng vào sáng thứ Bảy tuần này, nhưng đột xuất có lịch công tác nên không thể đến đúng hẹn. Bạn gọi điện tới phòng khám để xin dời sang tuần sau.',
      objective:
        'Thông báo lý do hủy lịch cũ lịch sự, hỏi các khung giờ còn trống trong tuần sau và chốt lại lịch hẹn mới chính xác.',
      roleA:
        'Bệnh nhân: Nói rõ họ tên, giờ hẹn cũ, xin lỗi vì sự thay đổi đột ngột và đề xuất các khung giờ rảnh vào tuần sau.',
      roleB:
        'Nhân viên lễ tân phòng khám: Kiểm tra sổ lịch hẹn, thông báo các khung giờ còn trống và xác nhận lại ngày giờ mới cùng lưu ý mang theo thẻ bảo hiểm.',
      hints: [
        '予約を変更していただきたいのですが、よろしいでしょうか (Tôi muốn xin đổi lịch hẹn, có được không ạ?)',
        '急な用事ができてしまい、伺えなくなりました (Vì có việc đột xuất nên tôi không thể đến được ạ)',
        '来週でしたら、水曜日の午後が都合がいいのですが、いかがでしょうか (Nếu là tuần sau thì chiều thứ Tư tôi thuận tiện, không biết có được không ạ?)',
        '来週の水曜日の午後3時でしたら、空きがございます (Nếu là 3 giờ chiều thứ Tư tuần sau thì phòng khám còn trống ạ)',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a103',
        '67230000000000000000a104',
      ],
      questionVersionIds: [
        '67230000000000000000b104',
        '67230000000000000000b105',
        '67230000000000000000b106',
      ],
    },
    {
      _id: '67230000000000000000c003',
      contentId: '67230000000000000000c003',
      versionId: '67230000000000000000c103',
      revision: 1,
      title: 'Liên hệ cửa hàng xử lý sản phẩm giao bị hỏng',
      context:
        'Bạn đặt mua một chiếc ấm đun nước trực tuyến. Khi mở hộp kiểm tra, bạn phát hiện nắp ấm bị nứt và không đóng kín được. Bạn gọi tới bộ phận chăm sóc khách hàng để yêu cầu đổi sản phẩm mới.',
      objective:
        'Mô tả chính xác tình trạng lỗi của sản phẩm, cung cấp mã đơn hàng và thống nhất phương án đổi hàng miễn phí hoặc hoàn tiền.',
      roleA:
        'Khách hàng: Giữ thái độ bình tĩnh, nêu rõ mã đơn hàng, tình trạng hư hỏng khi nhận hàng và mong muốn được đổi sản phẩm mới trước cuối tuần.',
      roleB:
        'Nhân viên chăm sóc khách hàng: Xin lỗi khách hàng về sự cố, xác nhận thông tin đơn hàng và hướng dẫn quy trình gửi trả hàng lỗi để nhận hàng thay thế.',
      hints: [
        '届いた商品のふたが割れていたのですが (Nắp của sản phẩm mới giao đến bị nứt ạ)',
        '別の新しいものと交換していただけますか (Anh/chị có thể đổi cho tôi sang một chiếc mới khác được không ạ?)',
        '箱の中に返送用の伝票が入れてありますので、そちらをご利用ください (Trong hộp đã có đặt sẵn phiếu gửi trả hàng rồi, xin quý khách hãy sử dụng phiếu đó)',
        'ご迷惑をおかけして申し訳ございません。すぐに代替品を手配いたします (Xin lỗi quý khách vì sự phiền toái. Chúng tôi sẽ sắp xếp hàng thay thế ngay lập tức)',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a105',
        '67230000000000000000a106',
      ],
      questionVersionIds: [
        '67230000000000000000b107',
        '67230000000000000000b108',
        '67230000000000000000b109',
      ],
    },
    {
      _id: '67230000000000000000c004',
      contentId: '67230000000000000000c004',
      versionId: '67230000000000000000c104',
      revision: 1,
      title: 'Thảo luận lịch trình và góp ý kế hoạch dã ngoại cuối tuần',
      context:
        'Nhóm bạn thân dự định đi chơi Hakone vào Chủ nhật tuần sau. Bạn thấy lịch trình hiện tại đi quá nhiều điểm trong một ngày nên muốn góp ý rút gọn lại để mọi người có thời gian nghỉ ngơi.',
      objective:
        'Đưa ra nhận xét khéo léo về lịch trình hiện tại, đề xuất phương án điều chỉnh hợp lý và thống nhất địa điểm ăn trưa.',
      roleA:
        'Người góp ý lịch trình: Khen ý tưởng ban đầu của bạn, sau đó đề xuất bỏ bớt một điểm tham quan xa để tránh bị gấp gáp về thời gian.',
      roleB:
        'Người lập kế hoạch: Lắng nghe góp ý, giải thích lý do muốn đi điểm đó nhưng sẵn sàng điều chỉnh nếu thời tiết xấu hoặc xe buýt đông.',
      hints: [
        '全部回ると時間が足りなくなりそうですね (Nếu đi hết tất cả thì có vẻ sẽ không đủ thời gian nhỉ)',
        '午後は温泉街をゆっくり歩くことにしてはどうですか (Buổi chiều chúng ta chọn đi dạo thong thả ở khu suối nước nóng thì sao?)',
        '天気予報によっては、予定を変更するかもしれません (Tùy theo dự báo thời tiết mà có lẽ chúng ta sẽ đổi kế hoạch đấy)',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a107',
        '67230000000000000000a108',
      ],
      questionVersionIds: [
        '67230000000000000000b110',
        '67230000000000000000b111',
        '67230000000000000000b112',
      ],
    },
    {
      _id: '67230000000000000000c005',
      contentId: '67230000000000000000c005',
      versionId: '67230000000000000000c105',
      revision: 1,
      title: 'Nhắn tin hoặc gọi điện xin nghỉ ốm và bàn giao việc trong ngày',
      context:
        'Sáng nay thức dậy bạn bị sốt nhẹ và đau họng nên không thể lên công ty. Bạn liên hệ với trưởng nhóm để xin nghỉ phép một ngày và nhờ đồng nghiệp theo dõi giúp email phản hồi từ khách hàng B.',
      objective:
        'Thông báo tình trạng sức khỏe kịp thời trước giờ làm, nêu rõ các đầu việc cần bàn giao trong ngày và cam kết cập nhật lại vào sáng hôm sau.',
      roleA:
        'Nhân viên xin nghỉ ốm: Xin lỗi vì báo gấp vào buổi sáng, mô tả công việc đang dở dang và nhờ trưởng nhóm chuyển giúp email khách hàng B cho người hỗ trợ.',
      roleB:
        'Trưởng nhóm: Hỏi thăm tình trạng sức khỏe, đồng ý cho nghỉ ngơi, xác nhận sẽ tiếp nhận đầu việc bàn giao và nhắc nhân viên đi khám nếu chưa đỡ.',
      hints: [
        '朝早くに急な連絡をしてしまい、申し訳ありません (Em xin lỗi vì đã liên lạc gấp vào sáng sớm ạ)',
        '朝から熱があるため、本日お休みをいただいてもよろしいでしょうか (Vì từ sáng em bị sốt nên hôm nay cho phép em xin nghỉ có được không ạ?)',
        'B社からのメールが届いた場合は、田中さんに対応をお願いできますか (Trong trường hợp có email từ công ty B gửi tới, anh/chị có thể nhờ anh Tanaka xử lý giúp được không ạ?)',
        '仕事のことは心配しないで、今日はゆっくり休んでください (Đừng lo về công việc, hôm nay hãy nghỉ ngơi cho khỏe nhé)',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a109',
        '67230000000000000000a110',
      ],
      questionVersionIds: [
        '67230000000000000000b113',
        '67230000000000000000b114',
        '67230000000000000000b115',
      ],
    },
  ],

  decks: [
    {
      _id: '672300000000000000001001',
      contentId: '672300000000000000001001',
      versionId: '67230000000000000000d101',
      revision: 1,
      title: 'Giao tiếp Đời sống & Công sở Trung cấp',
      topicKey: 'daily_work_and_life_n3',
      level: 'N3',
      description:
        'Luyện hội thoại tiếng Nhật trình độ N3 trong các tình huống đời sống và công sở thường gặp: nhờ kiểm tra tài liệu, đổi lịch hẹn, đổi trả hàng lỗi, góp ý kế hoạch và xin nghỉ phép bàn giao việc.',
      scenarioVersionIds: [
        '67230000000000000000c101',
        '67230000000000000000c102',
        '67230000000000000000c103',
        '67230000000000000000c104',
        '67230000000000000000c105',
      ],
      knowledgeVersionIds: [
        '67230000000000000000a101',
        '67230000000000000000a102',
        '67230000000000000000a103',
        '67230000000000000000a104',
        '67230000000000000000a105',
        '67230000000000000000a106',
        '67230000000000000000a107',
        '67230000000000000000a108',
        '67230000000000000000a109',
        '67230000000000000000a110',
      ],
      questionVersionIds: [
        '67230000000000000000b101',
        '67230000000000000000b102',
        '67230000000000000000b103',
        '67230000000000000000b104',
        '67230000000000000000b105',
        '67230000000000000000b106',
        '67230000000000000000b107',
        '67230000000000000000b108',
        '67230000000000000000b109',
        '67230000000000000000b110',
        '67230000000000000000b111',
        '67230000000000000000b112',
        '67230000000000000000b113',
        '67230000000000000000b114',
        '67230000000000000000b115',
      ],
    },
  ],
};
