// メンバーのデータ一覧
const memberData = {
    daimazin: {
        name: "大魔神",
        desc: "鋼メンタルで周りの人を巻き込むけどかわいい一面もあるイケメン。",
        url: "https://www.youtube.com/@daimazin"
    },
    usagon: {
        name: "うさごん",
        desc: "発狂系YouTuberのメンバー主",
        url: "https://www.youtube.com/channel/UCg0movb1wjAV63CQ_O7wyTg"
    },
    sasepico: {
        name: "させぴこ",
        desc: "うさごんの撮影メンバーで一番最初にVTuberデビューしたYouTuber。",
        url: "https://www.youtube.com/@sasepico"
    },
    ahahin: {
        name: "あはひん",
        desc: "",
        url: "https://www.youtube.com/@ahahin"
    },
    asami: {
        name: "あさみ",
        desc: "誰よりもイケメンに大魔神さんを描く絵師さん❣",
        url: "https://www.youtube.com/@k_%E3%81%82%E3%81%95%E3%81%BF"
    },
    geti: {
        name: "げち",
        desc: "",
        url: "https://www.youtube.com/@Gechi0519"
    },
    gabo: {
        name: "がぼ",
        desc: "うさごんさんのグッズのイラストやサムネ画像のイラストを担当しているすごい人。",
        url: "https://www.youtube.com/@gabogabo0414"
    },
    tonton: {
        name: "卍トントン卍",
        desc: "",
        url: "https://www.youtube.com/@tontondaaaaaa"
    },
    gyogyogyo: {
        name: "ギョギョギョ",
        desc: "サムネが面白すぎるYouTuber。よく大魔神さんと配信をしてるYouTuberの一人。",
        url: "https://www.youtube.com/@%E3%82%AE%E3%83%A7%E3%82%AE%E3%83%A7%E3%82%AE%E3%83%A70726"
    },
    ramune: {
        name: "星雲らむね",
        desc: "多分撮影メンバーの中で一番若い。うさごんさんにもてもて。",
        url: "https://www.youtube.com/@ramune_hoshigumo"
    },
    rai: {
        name: "らい",
        desc: "",
        url: "https://www.youtube.com/@lillil419/shorts"
    },
    aru: {
        name: "ある",
        desc: "",
        url: "https://www.youtube.com/@%E3%81%82%E3%82%8B_g_s/streams"
    },
    kikkoro: {
        name: "きっころ",
        desc: "よく大魔神さんと配信してるYouTuberの一人。よく「うりうり～」て言ってる。",
        url: "https://www.youtube.com/@kikkoro5656"
    }
};

// モーダル詳細を表示する関数
function showDetail(id) {
    const data = memberData[id];
    if (!data) return;

    const modalBody = document.getElementById('modal-body');
    const description = data.desc ? data.desc : "（説明文は準備中です💭）";

    modalBody.innerHTML = `
        <h2 style="color: #ff8cb8; margin-top: 0; font-size: 1.6rem;">${data.name}</h2>
        <p style="color: #7b6885; line-height: 1.6; margin: 15px 0;">${description}</p>
        <a href="${data.url}" target="_blank" rel="noopener noreferrer" class="channel-link">YouTubeチャンネルを見る ➔</a>
    `;

    // モーダルを中央に表示
    document.getElementById('modal').style.display = 'flex';
}

// モーダルを閉じる関数
function closeModal() {
    document.getElementById('modal').style.display = 'none';
}