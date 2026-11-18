import {test,expect} from '@playwright/test';

const tabs=page=>page.getByRole('tablist',{name:'Open requests'});
const newTab=page=>page.getByRole('button',{name:'Open new request tab'});

test('three saved request tabs reopen after restart without losing their URLs',async({page})=>{
  await page.goto('/');
  for(let i=1;i<=3;i++){
    await newTab(page).click();
    await page.getByRole('textbox',{name:'Request name'}).fill('Scenario request '+i);
    await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.test/scenario/'+i);
    await page.getByRole('button',{name:/Save request/}).click();
    await expect(page.locator('.toast')).toContainText('Request saved');
  }
  await expect(tabs(page).getByRole('tab')).toHaveCount(4);
  await page.getByRole('tab',{name:'Open Scenario request 1'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/scenario/1');
  await page.getByRole('tab',{name:'Open Scenario request 2'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/scenario/2');
  await page.reload();
  await expect(tabs(page).getByRole('tab')).toHaveCount(4);
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Scenario request 2');
  await page.getByRole('tab',{name:'Open Scenario request 3'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/scenario/3');
});

test('unsaved draft stays in its own tab and safe-close supports cancel and discard',async({page})=>{
  await page.goto('/');
  await newTab(page).click();
  await page.getByRole('textbox',{name:'Request name'}).fill('Unfinished post');
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.test/unsaved');
  await expect(page.getByText('Unsaved changes',{exact:true}).last()).toBeVisible();
  await newTab(page).click();
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.test/second');
  await page.getByRole('tab',{name:'Open Unfinished post'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/unsaved');
  await page.getByRole('button',{name:'Close tab Unfinished post'}).click();
  await expect(page.getByRole('heading',{name:'Close this request?'})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/unsaved');
  await page.getByRole('button',{name:'Close tab Unfinished post'}).click();
  await page.getByRole('button',{name:'Discard changes'}).click();
  await expect(page.getByRole('tab',{name:'Open Unfinished post'})).toHaveCount(0);
  await page.getByRole('tab',{name:'Open Untitled request'}).last().click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/second');
});

test('save-and-close stores renamed draft in its chosen collection',async({page})=>{
  await page.goto('/');
  await newTab(page).click();
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.test/save-on-close');
  page.once('dialog',dialog=>dialog.accept('Saved from modal'));
  await page.getByRole('button',{name:'Rename',exact:true}).click();
  await page.getByRole('button',{name:'Close tab Saved from modal'}).click();
  await page.getByRole('button',{name:'Save and close'}).click();
  await expect(page.locator('.request-nav').filter({hasText:'Saved from modal'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Open Saved from modal'})).toHaveCount(0);
  await page.locator('.request-nav').filter({hasText:'Saved from modal'}).click();
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue('https://example.test/save-on-close');
});

test('tab preference storage contains only identifiers, not request content',async({page})=>{
  await page.goto('/');
  await newTab(page).click();
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://example.test/private?token=secret-123');
  await page.getByRole('textbox',{name:'Request name'}).fill('Secret name');
  const stored=await page.evaluate(()=>localStorage.getItem('api-studio.editor-tabs.v1'));
  expect(stored).toBeTruthy();
  expect(stored).not.toContain('secret-123');
  expect(stored).not.toContain('Secret name');
  expect(stored).not.toContain('example.test');
  expect(stored).not.toContain('bearerToken');
});
