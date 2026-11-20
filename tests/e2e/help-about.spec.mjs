import {test,expect} from '@playwright/test';
const api='https://api.github.com/repos/mehrdadbahrainy/api-studio/releases?per_page=30';
test('Help/About exposes source, documentation, license, shortcuts and a working release checker',async({page})=>{
  await page.route(api,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {tag_name:'v0.2.2',draft:false,prerelease:false,html_url:'https://malicious.example/avoid'},
    {tag_name:'v0.2.0-rc.1',draft:false,prerelease:true},
    {tag_name:'v0.1.4',draft:false,prerelease:false}
  ])}));
  await page.goto('/');
  await page.getByRole('button',{name:'Help and About'}).click();
  const modal=page.getByRole('dialog',{name:'API Studio'});
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Installed version');
  await expect(modal.getByRole('link',{name:'Source code on GitHub'})).toHaveAttribute('href','https://github.com/mehrdadbahrainy/api-studio');
  await expect(modal.getByRole('link',{name:'README documentation'})).toHaveAttribute('href',/README\.md$/);
  await expect(modal.getByRole('link',{name:'Persian quickstart guide'})).toHaveAttribute('href',/QUICKSTART\.fa\.md$/);
  await expect(modal.getByRole('link',{name:'Report an issue'})).toHaveAttribute('href',/issues$/);
  await modal.getByRole('button',{name:'Check for updates'}).click();
  await expect(modal).toContainText('Update available: v0.2.2');
  await expect(modal.getByRole('link',{name:'Open release & download'})).toHaveAttribute('href','https://github.com/mehrdadbahrainy/api-studio/releases/tag/v0.2.2');
  await expect(page.getByText('New version v0.2.2 is available.')).toBeVisible();
  await modal.getByRole('button',{name:'Close Help and About'}).click();
  await expect(modal).toHaveCount(0);
});
test('Help/About shows an explicit offline error, without claiming an update',async({page})=>{
  await page.route(api,route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto('/');
  await page.getByRole('button',{name:'Help and About'}).click();
  const modal=page.getByRole('dialog',{name:'API Studio'});
  await modal.getByRole('button',{name:'Check for updates'}).click();
  await expect(modal.getByRole('alert')).toContainText('Could not reach GitHub Releases');
  await expect(modal.getByRole('link',{name:'Open release & download'})).toHaveCount(0);
});

test('Help/About reports no update when current installed patch is latest stable',async({page})=>{
  await page.route(api,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
    {tag_name:'v0.2.1',draft:false,prerelease:false},
    {tag_name:'v0.2.2-rc.1',draft:false,prerelease:true},
    {tag_name:'v0.2.0',draft:false,prerelease:false}
  ])}));
  await page.goto('/');
  await page.getByRole('button',{name:'Help and About'}).click();
  const modal=page.getByRole('dialog',{name:'API Studio'});
  await expect(modal).toContainText('0.2.1');
  await modal.getByRole('button',{name:'Check for updates'}).click();
  await expect(modal).toContainText('No newer stable release is available.');
  await expect(modal.getByRole('link',{name:'Open release & download'})).toHaveCount(0);
});
