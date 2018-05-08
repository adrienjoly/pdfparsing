const memwatch = require('memwatch-next');

const filename = './en.netscaler-10.ns-rn-release-notes-10-wrapper-con.pdf';

const parsers = [
  {
    name: 'PDF.js',
    load() {
      this.pdfjsLib = require('pdfjs-dist');
    },
    parse(filename) {
      const loadingTask = this.pdfjsLib.getDocument(filename);
      return loadingTask.promise.then(doc => {
        // inspired from https://stackoverflow.com/a/20522307/592254
        // (note: page numbering starts at 1)
        const parsePageContent = pageNum => doc.getPage(pageNum).then(page =>
          page.getTextContent().then(textContent => textContent.items.map(o => o.str).join('\n'))
        );
        // from https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.js
        return doc.getMetadata().then(async data => ({
          info: data.info,
          metadata: data.metadata && data.metadata.getAll(),
          text: await parsePageContent(1),
        }));
      });
    }
  },
  {
    name: 'tika-text-extract',
    async load() {
      this.readFileSync = require('fs').readFileSync;
      this.tika = require('tika-text-extract');
      await this.tika.startServer('./tika-server-1.14.jar'); // download from http://archive.apache.org/dist/tika/
    },
    async parse(filename) {
      return {
        text: await this.tika.extract(this.readFileSync(filename)),
      };
    }
  },
];

class Probe {
  constructor(msg){
    this.time = new Date();
    this.heap = new memwatch.HeapDiff();
    if (msg) console.log(msg);
  }
  stop() {
    this.diff = {
      time: new Date() - this.time,
      mem: this.heap.end().change.size,
    };
    return this;
  }
  printDiff(ctx) {
    console.log(`(i) ${ctx}: ${this.diff.mem}, ${this.diff.time/1000} s.`);
  }
}

async function benchmark(parser) {

  const loading = new Probe(`loading ${parser.name}...`);
  await parser.load();
  loading.stop();

  const parsing = new Probe(`parsing with ${parser.name}...`);
  const parsed = await parser.parse(filename)
  parsing.stop();
  console.log('=>', Object.keys(parsed).map(
    key => `\n  ${key}: ${typeof parsed[key] === 'string' ? `(${parsed[key].length} bytes)` : JSON.stringify(parsed[key], null, 2) }`
  ).join(''));

  console.log('(i) size of pdf file:', require('fs').statSync(filename).size, 'bytes');
  loading.printDiff('to load the parser');
  parsing.printDiff('to parse the file');
}

// if index of parser is provided as a command line argument, just benchmark that one
if (process.argv.length === 3) {
  benchmark(parsers[parseInt(process.argv[2])]);
} else {
  console.error(`usage: node ${process.argv[1].split('/').pop()} <index> (with index = value between 0 and ${parsers.length - 1})`);
}
