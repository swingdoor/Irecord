/**
 * 关键词提取模块
 * 使用 nodejieba 的 TF-IDF 提取 + 停用词过滤
 */
const jieba = require('nodejieba');

// 中文停用词表（常见虚词、助词、连词等）
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  '什么', '怎么', '如何', '为什么', '哪', '谁', '多少', '几',
  '吗', '吧', '呢', '啊', '哦', '嗯', '呀', '哈', '嘛',
  '但', '但是', '然后', '所以', '因为', '如果', '虽然', '而且', '或者',
  '这个', '那个', '这些', '那些', '这样', '那样', '这里', '那里',
  '可以', '可能', '应该', '需要', '已经', '正在', '还是', '还有',
  '比较', '非常', '特别', '真的', '其实', '当然', '一般', '基本',
  '就是', '只是', '不是', '还是', '而是', '或是',
  '把', '被', '让', '给', '对', '从', '向', '跟', '与', '及',
  '之', '等', '等等', '以及', '以上', '以下', '之间', '之后', '之前',
  '来', '去', '过', '起来', '出来', '下去', '上去',
  '个', '些', '种', '样', '次', '件', '条', '点',
  '做', '想', '能', '得', '地', '得到',
]);

/**
 * 从文本中提取关键词
 * @param {string} text 输入文本
 * @param {number} topN 返回关键词数量，默认 10
 * @returns {Array<{word: string, score: number}>}
 */
function extractKeywords(text, topN = 10) {
  if (!text || text.trim().length === 0) return [];

  // 使用 nodejieba 的 TF-IDF 提取关键词（提取更多，后续过滤）
  const candidates = jieba.extract(text, topN * 3);

  // 过滤停用词、单字、纯数字、纯标点
  const filtered = candidates.filter(item => {
    const word = item.word.trim();
    if (word.length <= 1) return false;
    if (STOP_WORDS.has(word)) return false;
    if (/^\d+$/.test(word)) return false;
    if (/^[，。！？、；：""''（）【】《》\s]+$/.test(word)) return false;
    return true;
  });

  // 取 Top N，保留 word 和 score
  return filtered.slice(0, topN).map(item => ({
    word: item.word,
    score: Math.round(item.weight * 100) / 100,
  }));
}

module.exports = { extractKeywords };
