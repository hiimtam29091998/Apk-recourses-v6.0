"""TEST-ONLY adapter: parses the JS-generated CPLEX LP into a SciPy MILP.
Not included in the Android APK. Run through Node child_process on desktop CI.
"""
import sys, json, re
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix
s=sys.stdin.read()
parts={}
for k in ['Minimize','Subject To','Bounds','Generals','End']:
    if k not in s: raise ValueError('Missing LP section '+k)
a=s.split('Minimize\n',1)[1];obj,other=a.split('Subject To\n',1);rows,b=other.split('Bounds\n',1);bounds,integ=b.split('Generals\n',1)
term_re=re.compile(r'(?P<sign>[+-])?\s*(?P<num>\d+(?:\.\d+)?)?\s*v(?P<idx>\d+)')
def parse_expr(x):
    terms={}
    for match in term_re.finditer(x):
        j=int(match.group('idx'))
        num=float(match.group('num') or 1)
        if match.group('sign')=='-':num*=-1
        terms[j]=terms.get(j,0)+num
    return terms
bs=[]
for line in bounds.splitlines():
    line=line.strip()
    if not line:continue
    mat=re.fullmatch(r'([-\d.]+) <= v(\d+) <= ([-\d.]+)',line)
    if not mat:raise ValueError('Bad bounds '+line)
    bs.append((int(mat.group(2)),float(mat.group(1)),float(mat.group(3))))
n=max(x[0] for x in bs)+1
l=np.zeros(n);h=np.zeros(n)
for j,lo,hi in bs:l[j]=lo;h[j]=hi
c=np.zeros(n)
for j,v in parse_expr(obj.split('obj:',1)[1]).items():c[j]=v
rs,cs,vs=[],[],[];low=[];high=[]
for line in rows.splitlines():
    line=line.strip()
    if not line:continue
    if not re.match(r'c\d+[lh]?:',line):raise ValueError('Bad constraint '+line[:80])
    _,expr=line.split(':',1)
    ma=re.match(r'(.*) (>=|<=|=) ([-\d.]+)$',expr.strip())
    if not ma:raise ValueError('Bad row expr '+expr[:100])
    terms=parse_expr(ma.group(1));sign=ma.group(2);v=float(ma.group(3))
    i=len(low);low.append(v if sign in ('>=','=') else -np.inf);high.append(v if sign in ('<=','=') else np.inf)
    for j,num in terms.items():rs.append(i);cs.append(j);vs.append(num)
A=coo_matrix((vs,(rs,cs)),shape=(len(low),n)).tocsr()
result=milp(c,integrality=np.ones(n),bounds=Bounds(l,h),constraints=LinearConstraint(A,low,high),options={'time_limit':65,'mip_rel_gap':0})
if result.x is None or result.status!=0:
 print(json.dumps({'Status':'Infeasible' if result.x is None else 'TimeLimit','message':str(result.message)}))
else:
 print(json.dumps({'Status':'Optimal','ObjectiveValue':float(result.fun),'Columns':{'v'+str(i):{'Primal':float(v)} for i,v in enumerate(result.x)}}))
