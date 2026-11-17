import {expect,test} from '@playwright/test';

async function sidebarWidth(page) {
  return page.locator('.sidebar').evaluate(element=>element.getBoundingClientRect().width);
}

test('collections expand, collapse and persist without deleting saved requests',async({page})=>{
  await page.goto('/');
  const toggle=page.getByRole('button',{name:'Collapse Getting started'});
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('.collection-requests .request-nav')).toHaveCount(1);
  await toggle.click();
  await expect(page.getByRole('button',{name:'Expand Getting started'})).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.collection-requests')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'Expand Getting started'})).toBeVisible();
  await expect(page.locator('.collection-requests')).toHaveCount(0);
  await page.getByRole('button',{name:'Expand Getting started'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.collection-requests .request-nav')).toHaveCount(1);
  await expect(page.getByRole('textbox',{name:'Request URL'})).toHaveValue(/jsonplaceholder/);
});

test('expand/collapse all and searching temporarily reveal matching requests',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'New collection'}).click();
  await page.getByPlaceholder('Collection name').fill('Imported API');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.locator('.collection-title')).toHaveCount(2);
  await page.getByRole('button',{name:'Collapse all collections'}).click();
  await expect(page.locator('.collection-requests')).toHaveCount(0);
  await page.getByRole('textbox',{name:'Filter requests'}).fill('sample TODO');
  await expect(page.locator('.collection-requests .request-nav')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Filter requests'}).fill('');
  await expect(page.locator('.collection-requests')).toHaveCount(0);
  await page.getByRole('button',{name:'Expand all collections'}).click();
  await expect(page.locator('.collection-requests')).toHaveCount(2);
});

test('mouse resizing clamps width and restores the user preference on restart',async({page})=>{
  await page.setViewportSize({width:1300,height:850});
  await page.goto('/');
  const initial=await sidebarWidth(page);
  const splitter=page.getByRole('separator',{name:'Resize sidebar'});
  await expect(splitter).toBeVisible();
  const rect=await splitter.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect.x+rect.width/2,rect.y+120);
  await page.mouse.down();
  await page.mouse.move(rect.x+rect.width/2+124,rect.y+120,{steps:7});
  await page.mouse.up();
  await expect.poll(()=>sidebarWidth(page)).toBeGreaterThan(initial+80);
  const final=await sidebarWidth(page);
  await page.reload();
  await expect.poll(()=>sidebarWidth(page)).toBeGreaterThan(final-3);
  const now=await sidebarWidth(page);
  expect(Math.abs(now-final)).toBeLessThan(4);
});

test('keyboard resizing supports arrows and boundaries',async({page})=>{
  await page.setViewportSize({width:1280,height:850});
  await page.goto('/');
  const splitter=page.getByRole('separator',{name:'Resize sidebar'});
  await splitter.focus();
  await page.keyboard.press('Home');
  await expect(splitter).toHaveAttribute('aria-valuenow','228');
  await page.keyboard.press('ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow','248');
  await page.keyboard.press('End');
  await expect(splitter).toHaveAttribute('aria-valuenow','480');
  await page.keyboard.press('ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow','480');
  await page.keyboard.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow','460');
});

test('compact navigation rail expands the editor and survives reload',async({page})=>{
  await page.setViewportSize({width:1280,height:850});
  await page.goto('/');
  const before=await sidebarWidth(page);
  await page.getByRole('button',{name:'Collapse sidebar'}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
  await expect.poll(()=>sidebarWidth(page)).toBeLessThan(before-100);
  await expect(page.getByRole('tab',{name:'History'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
  await page.getByRole('tab',{name:'Collections'}).click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-collapsed/);
  await expect(page.getByRole('button',{name:'Collapse Getting started'})).toBeVisible();
});

test('icon-only buttons center their SVGs in both axes',async({page})=>{
  await page.goto('/');
  const names=['Collapse sidebar','New collection','New request','Workspace actions','Expand all collections'];
  for(const name of names){
    const button=page.getByRole('button',{name,exact:true});
    const geometry=await button.evaluate(element=>{
      const icon=element.querySelector('svg');
      if(!icon)return null;
      const a=element.getBoundingClientRect(),b=icon.getBoundingClientRect();
      return {x:Math.abs(a.left+a.width/2-b.left-b.width/2),
        y:Math.abs(a.top+a.height/2-b.top-b.height/2),size:b.width};
    });
    expect(geometry, name+' must have an icon').not.toBeNull();
    expect(geometry.size, name).toBeGreaterThanOrEqual(13);
    expect(geometry.x, name).toBeLessThanOrEqual(3);
    expect(geometry.y, name).toBeLessThanOrEqual(3);
  }
  const send=page.getByRole('button',{name:'Send',exact:true});
  const y=await send.evaluate(el=>{
    const svg=el.querySelector('svg'),a=el.getBoundingClientRect(),b=svg.getBoundingClientRect();
    return Math.abs(a.top+a.height/2-b.top-b.height/2);
  });
  expect(y).toBeLessThanOrEqual(3);
});

test('mobile sidebar can collapse without horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Collapse sidebar'}).click();
  await expect(page.locator('.sidebar')).toHaveClass(/is-collapsed/);
  await expect(page.getByRole('textbox',{name:'Request URL'})).toBeVisible();
  const sizes=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport+3);
  await page.getByRole('button',{name:'Expand sidebar'}).click();
  await expect(page.getByRole('textbox',{name:'Filter requests'})).toBeVisible();
});
