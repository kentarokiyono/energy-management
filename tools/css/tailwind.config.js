/* Tailwind (v3) の CSS を事前生成する設定。index.html や js のクラスを変えたら css/tailwind.css を作り直す:
   npx tailwindcss@3.4.17 -c tools/css/tailwind.config.js -i tools/css/in.css -o css/tailwind.css --minify */
module.exports={ content:["./index.html","./js/**/*.js"] };
