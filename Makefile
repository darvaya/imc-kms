install:
	yarn install --immutable

build:
	yarn build

migrate:
	NODE_ENV=production yarn db:migrate

start:
	mkdir -p logs
	pm2 start ecosystem.config.cjs

stop:
	pm2 stop kms

restart:
	pm2 restart kms

logs:
	pm2 logs kms

status:
	pm2 status

deploy: install build migrate restart

.PHONY: install build migrate start stop restart logs status deploy
